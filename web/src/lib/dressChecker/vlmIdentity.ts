/**
 * VLM identity verification — the precision stage of the Dress Checker.
 *
 * Local embeddings (SigLIP/DINOv2) cannot reliably distinguish visually similar
 * bridal lehengas photographed in different poses (folded/hanging/worn/mannequin).
 * They are used only for RECALL (shortlisting candidates). This module uses Claude
 * Vision to make the final SAME-PHYSICAL-DRESS decision by reasoning about specific
 * motifs, border geometry, panel layout, and colour placement — robust to angle,
 * background, distance, lighting, folding and cropping.
 */
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const VLM_MODEL = process.env.DRESS_CHECKER_VLM_MODEL || "claude-sonnet-4-6";
const MAX_CANDIDATES = 8;
const MAX_IMAGES_PER_CANDIDATE = 3;

export type VlmCandidateImage = Buffer;

export type VlmCandidate = {
  itemId: number;
  sku: string;
  name: string;
  images: VlmCandidateImage[];
};

export type VlmPerCandidate = {
  itemId: number;
  sku: string;
  sameDress: boolean;
  confidence: number;
  notes: string;
};

export type VlmVerdict = {
  usedVlm: boolean;
  matchItemId: number | null;
  confidence: number;
  reasoning: string;
  perCandidate: VlmPerCandidate[];
  error?: string;
};

/** VLM precision is available when an Anthropic key is configured and not disabled. */
export function isVlmAvailable(): boolean {
  if (process.env.DRESS_CHECKER_VLM === "0") return false;
  return !!process.env.ANTHROPIC_API_KEY;
}

async function toBase64(buffer: Buffer, size = 720): Promise<string> {
  const out = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString("base64");
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };

const SYSTEM_PROMPT = `You are an expert Indian bridal-wear cataloguer for a garment RENTAL business.
Your single job: decide whether an uploaded dress photo is the SAME PHYSICAL GARMENT as any
catalogue item, so staff can find the exact rented outfit when it is returned.

You must be robust to: different camera angle, distance, lighting, background/shop clutter,
the dress being worn / on a mannequin / on a hanger / folded flat / held by a person, and to
partial views (only skirt, only blouse, only dupatta).

Judge IDENTITY, not visual similarity. Two DIFFERENT dresses can look alike (same colour family,
same "heavy bridal embroidery"). Focus on features that are unique to one physical garment:
- exact motif shapes and their placement (peacocks, elephants, specific florals, figures)
- the bottom border pattern and its scallop/geometry
- vertical panel layout and how colours are distributed across panels
- unusual colour blocking (e.g. olive + wine + peach panels in a specific order)
- blouse/neckline embroidery layout, dupatta pattern

Colour ALONE is never enough. Two green lehengas or two peach lehengas are NOT the same dress
unless the motifs and panel layout match. If the visible region is partial, match on whatever
distinctive detail is visible.

Return ONLY valid JSON (no markdown, no code fences) in exactly this shape:
{
  "best_match_index": <integer index of the same-dress candidate, or -1 if none match>,
  "overall_confidence": <0-100 confidence that best_match is the SAME physical dress>,
  "reasoning": "<one concise sentence citing the specific shared or differing motifs>",
  "candidates": [
    { "index": <int>, "same_dress": <true|false>, "confidence": <0-100>, "notes": "<short specific note>" }
  ]
}
Confidence guide: 95-100 = certainly the same physical dress; 90-94 = very likely, minor doubt;
70-89 = plausible but not sure; below 70 = probably different.`;

function safeParse(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Ask Claude which shortlisted candidate (if any) is the same physical dress as the query.
 * Candidates should already be ordered best-first by local recall; index in prompt = array index.
 */
export async function verifyDressIdentity(
  queryImage: Buffer,
  candidates: VlmCandidate[],
): Promise<VlmVerdict> {
  const shortlist = candidates.slice(0, MAX_CANDIDATES);
  if (!isVlmAvailable() || shortlist.length === 0) {
    return {
      usedVlm: false,
      matchItemId: null,
      confidence: 0,
      reasoning: "VLM unavailable",
      perCandidate: [],
    };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const content: ContentBlock[] = [];
    content.push({
      type: "text",
      text: "UPLOADED DRESS TO IDENTIFY (find the same physical garment among the catalogue candidates below):",
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: await toBase64(queryImage) },
    });

    for (let i = 0; i < shortlist.length; i++) {
      const c = shortlist[i];
      content.push({
        type: "text",
        text: `CANDIDATE index ${i} — SKU ${c.sku} — "${c.name}" (${c.images.length} reference photo(s)):`,
      });
      for (const img of c.images.slice(0, MAX_IMAGES_PER_CANDIDATE)) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: await toBase64(img) },
        });
      }
    }

    content.push({
      type: "text",
      text: `There are ${shortlist.length} candidates (index 0 to ${shortlist.length - 1}). Return the JSON verdict now.`,
    });

    const response = await client.messages.create({
      model: VLM_MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const parsed = safeParse(raw) as
      | {
          best_match_index?: number;
          overall_confidence?: number;
          reasoning?: string;
          candidates?: Array<{ index?: number; same_dress?: boolean; confidence?: number; notes?: string }>;
        }
      | null;

    if (!parsed) {
      return {
        usedVlm: true,
        matchItemId: null,
        confidence: 0,
        reasoning: "Could not parse VLM response",
        perCandidate: [],
        error: "parse_failed",
      };
    }

    const perCandidate: VlmPerCandidate[] = (parsed.candidates || [])
      .map((row) => {
        const idx = typeof row.index === "number" ? row.index : -1;
        const c = shortlist[idx];
        if (!c) return null;
        return {
          itemId: c.itemId,
          sku: c.sku,
          sameDress: !!row.same_dress,
          confidence: clamp(row.confidence),
          notes: String(row.notes || ""),
        };
      })
      .filter((v): v is VlmPerCandidate => v !== null);

    const bestIdx = typeof parsed.best_match_index === "number" ? parsed.best_match_index : -1;
    const bestCandidate = bestIdx >= 0 ? shortlist[bestIdx] : null;

    return {
      usedVlm: true,
      matchItemId: bestCandidate?.itemId ?? null,
      confidence: clamp(parsed.overall_confidence),
      reasoning: String(parsed.reasoning || ""),
      perCandidate,
    };
  } catch (err) {
    return {
      usedVlm: false,
      matchItemId: null,
      confidence: 0,
      reasoning: "VLM error",
      perCandidate: [],
      error: err instanceof Error ? err.message : "vlm_failed",
    };
  }
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}
