/**
 * Enterprise OpenAI bridal forensics — NOT a primary search engine.
 *
 * Roles:
 * 1. Permanent inventory fingerprint extraction (once at index)
 * 2. Query-type understanding (optional, cached per search)
 * 3. Ambiguous-candidate forensic verifier (gated 70–92)
 * 4. sameCollection vs sameDress discrimination
 *
 * Embeddings + fingerprints remain the primary engine.
 */

import sharp from "sharp";
import { resolveOpenAiKey } from "@/lib/ai/aiRuntimeSettings";
import prisma from "@/lib/prisma";
import {
  INVENTORY_AI_FINGERPRINT_VERSION,
  upsertInventoryAiFingerprint,
  validateInventoryAiFingerprintPayload,
} from "./inventoryAiFingerprint";
import type { DressQueryType } from "./queryTypeDetection";

const VLM_MODEL = process.env.DRESS_CHECKER_VLM_MODEL || "gpt-4o";
export const BRIDAL_FP_PROMPT_VERSION = "bridal_fp_v1";
export const FORENSIC_PROMPT_VERSION = "bridal_forensic_v2";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function isDressCheckerOpenAiEnabled(): boolean {
  const raw = (process.env.DRESS_CHECKER_OPENAI_ENABLED ?? process.env.DRESS_CHECKER_VLM ?? "1")
    .trim()
    .toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no");
}

/** PHASE 9 — OpenAI usage policy */
export const OPENAI_USAGE_POLICY = {
  /** Auto-accept — never call GPT */
  autoAcceptMin: 92,
  /** Ambiguous band — call GPT */
  gptMin: envNumber("DRESS_CHECKER_OPENAI_VERIFY_MIN_SCORE", 70),
  gptMax: envNumber("DRESS_CHECKER_OPENAI_VERIFY_MAX_SCORE", 92),
  /** Below — reject without GPT */
  rejectBelow: 70,
  /** GPT only on top N after region rerank */
  verifyTopN: 3,
  /** ANN recall */
  annLimit: envNumber("DRESS_CHECKER_ANN_RECALL_K", 100),
  /** After fingerprint filter */
  fingerprintTopN: 20,
  /** After region rerank */
  regionTopN: 10,
  maxOpenAiCallsPerSearch: envNumber("DRESS_CHECKER_MAX_OPENAI_CALLS_PER_SEARCH", 1),
  maxOpenAiCallsPerRun: envNumber("DRESS_CHECKER_MAX_OPENAI_CALLS_PER_RUN", 0),
} as const;

export function shouldCallOpenAiForScore(score: number): "auto_accept" | "verify" | "reject" {
  if (score > OPENAI_USAGE_POLICY.autoAcceptMin) return "auto_accept";
  if (score < OPENAI_USAGE_POLICY.rejectBelow) return "reject";
  if (score >= OPENAI_USAGE_POLICY.gptMin && score <= OPENAI_USAGE_POLICY.gptMax) return "verify";
  return "reject";
}

export type BridalInventoryFingerprint = {
  primaryColor: string;
  secondaryColors: string[];
  colorFamilies: string[];
  embroideryDensity: string;
  embroideryStyle: string;
  motifs: string[];
  motifCount: number;
  motifPositions: Array<{ motif: string; x?: number; y?: number }>;
  panelCount: number;
  panelSequence: string[];
  borderType: string;
  borderPatterns: string[];
  blouseStyle: string;
  dupattaStyle: string;
  silhouette: string;
  uniqueIdentifiers: string[];
  stoneWork: boolean;
  mirrorWork: boolean;
  zariWork: boolean;
  threadWork: boolean;
  confidence: number;
  gptDescription: string;
};

export type GptQueryUnderstanding = {
  queryType: DressQueryType | string;
  confidence: number;
  notes: string;
};

export type ForensicVerification = {
  sameDress: boolean;
  sameCollection: boolean;
  confidence: number;
  reasoning: string;
  differences: string[];
  similarities: string[];
  matchedIdentifiers: string[];
};

async function toBase64(buffer: Buffer, size = 720): Promise<string> {
  const out = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString("base64");
}

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

async function callOpenAiJson(
  system: string,
  userParts: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }>,
): Promise<{ text: string; model: string }> {
  const apiKey = await resolveOpenAiKey();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VLM_MODEL,
      temperature: 0.1,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: userParts },
      ],
    }),
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`OpenAI failed: ${response.status} ${raw || response.statusText}`);
  }
  const payload = (await response.json()) as {
    output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
  };
  const text = (payload.output || [])
    .flatMap((row) => row.content || [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text || "")
    .join("")
    .trim();
  return { text, model: VLM_MODEL };
}

const FINGERPRINT_PROMPT = `You are an expert bridal fashion analyst for Indian rental inventory (lehenga / saree / anarkali).

Analyze this garment image.

Ignore:
- background
- mannequin
- hanger
- person
- lighting
- pose

Extract ONLY garment properties.

Return ONLY valid JSON:
{
  "primaryColor": "",
  "secondaryColors": [],
  "colorFamilies": [],
  "embroideryDensity": "low|medium|high|very_high",
  "embroideryStyle": "",
  "motifs": [],
  "motifCount": 0,
  "motifPositions": [{"motif":"peacock","x":0.5,"y":0.4}],
  "panelCount": 0,
  "panelSequence": [],
  "borderType": "",
  "borderPatterns": [],
  "blouseStyle": "",
  "dupattaStyle": "",
  "silhouette": "",
  "uniqueIdentifiers": [],
  "stoneWork": false,
  "mirrorWork": false,
  "zariWork": false,
  "threadWork": false,
  "confidence": 85,
  "gptDescription": "one sentence"
}`;

const QUERY_TYPE_PROMPT = `You are a bridal inventory search assistant.

Determine the query image type for dress matching.

Possible values:
FULL_DRESS, LOWER_SKIRT, BORDER_ONLY, BLOUSE_ONLY, DUPATTA_ONLY,
CUSTOMER_WEARING, HANGER, MANNEQUIN, FOLDED, MULTIPLE_DRESSES,
PARTIAL_VIEW, LOW_LIGHT, BLURRY

Return ONLY JSON:
{
  "queryType": "LOWER_SKIRT",
  "confidence": 90,
  "notes": "brief"
}`;

const FORENSIC_PROMPT = `You are a bridal forensic examiner for rental inventory.

Determine whether Image A (query) and Image B (catalogue) show the SAME PHYSICAL GARMENT.

Cross-view cases that may still be the SAME dress:
- catalog ↔ hanger
- catalog ↔ mannequin
- catalog ↔ customer wearing
- catalog ↔ folded
- catalog ↔ lower skirt only
- catalog ↔ blouse only
- catalog ↔ border crop
- catalog ↔ WhatsApp image / screenshot

Ignore:
- lighting, background, mannequin, person, pose
- image quality, wrinkles, cropping, saturation

Focus ONLY on:
1. Border sequence
2. Floral panel ordering
3. Motif positions
4. Embroidery layouts
5. Stone patterns
6. Unique ornamental structures

FALSE POSITIVE PREVENTION:
If dresses are extremely similar (same collection / lookalike series like "ONION BRIDAL" vs "ONION BRIDAL 2")
but border motifs or panel sequences differ:
set sameCollection=true, sameDress=false.

Return ONLY JSON:
{
  "sameDress": true,
  "sameCollection": false,
  "confidence": 95,
  "reasoning": "",
  "differences": [],
  "similarities": [],
  "matchedIdentifiers": []
}`;

function normalizeFingerprint(raw: Record<string, unknown>): BridalInventoryFingerprint {
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const bool = (v: unknown) => v === true || v === "true";
  return {
    primaryColor: String(raw.primaryColor || raw.primaryColour || ""),
    secondaryColors: arr(raw.secondaryColors),
    colorFamilies: arr(raw.colorFamilies),
    embroideryDensity: String(raw.embroideryDensity || ""),
    embroideryStyle: String(raw.embroideryStyle || ""),
    motifs: arr(raw.motifs),
    motifCount: Number(raw.motifCount) || arr(raw.motifs).length,
    motifPositions: Array.isArray(raw.motifPositions)
      ? (raw.motifPositions as BridalInventoryFingerprint["motifPositions"])
      : [],
    panelCount: Number(raw.panelCount) || 0,
    panelSequence: arr(raw.panelSequence),
    borderType: String(raw.borderType || ""),
    borderPatterns: arr(raw.borderPatterns),
    blouseStyle: String(raw.blouseStyle || ""),
    dupattaStyle: String(raw.dupattaStyle || ""),
    silhouette: String(raw.silhouette || ""),
    uniqueIdentifiers: arr(raw.uniqueIdentifiers),
    stoneWork: bool(raw.stoneWork),
    mirrorWork: bool(raw.mirrorWork),
    zariWork: bool(raw.zariWork),
    threadWork: bool(raw.threadWork),
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0))),
    gptDescription: String(raw.gptDescription || raw.description || ""),
  };
}

/** PHASE 2 — Extract bridal fingerprint once; store permanently. Do not call on every search. */
export async function extractBridalInventoryFingerprint(
  imageBuffer: Buffer,
): Promise<BridalInventoryFingerprint> {
  const b64 = await toBase64(imageBuffer);
  const { text } = await callOpenAiJson("Return JSON only. Bridal garment analyst.", [
    { type: "input_text", text: FINGERPRINT_PROMPT },
    { type: "input_image", image_url: `data:image/jpeg;base64,${b64}` },
  ]);
  const parsed = safeParse(text) as Record<string, unknown> | null;
  if (!parsed) throw new Error("Could not parse bridal fingerprint JSON");
  return normalizeFingerprint(parsed);
}

/** Persist fingerprint — skips if already extracted (unless force). */
export async function ensureInventoryAiFingerprint(
  itemId: number,
  imageBuffer: Buffer,
  opts: { force?: boolean; imageHash?: string; sourceImage?: string | null } = {},
): Promise<BridalInventoryFingerprint | null> {
  if (!isDressCheckerOpenAiEnabled()) return null;

  try {
    const imageHash =
      opts.imageHash ||
      (await import("./inventoryAiFingerprint")).hashImageBuffer(imageBuffer);
    const existing = await prisma.$queryRaw<Array<{ item_id: number }>>`
      SELECT item_id FROM inventory_ai_fingerprints
      WHERE item_id = ${itemId}
        AND input_image_hash = ${imageHash}
        AND fingerprint_version = ${INVENTORY_AI_FINGERPRINT_VERSION}
        AND validation_status = 'VALID'
        AND model IS NOT NULL
        AND model <> 'deterministic'
      LIMIT 1
    `;
    if (existing.length && !opts.force) {
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM inventory_ai_fingerprints
        WHERE item_id = ${itemId}
          AND input_image_hash = ${imageHash}
          AND fingerprint_version = ${INVENTORY_AI_FINGERPRINT_VERSION}
          AND validation_status = 'VALID'
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      const row = rows[0];
      if (row) {
        return normalizeFingerprint({
          primaryColor: row.primary_color,
          secondaryColors: row.secondary_colors,
          colorFamilies: row.color_families,
          embroideryDensity: row.embroidery_density,
          embroideryStyle: row.embroidery_style,
          motifs: row.motifs,
          motifCount: row.motif_count,
          motifPositions: row.motif_positions,
          panelCount: row.panel_count,
          panelSequence: row.panel_sequence,
          borderType: row.border_type,
          borderPatterns: row.border_patterns,
          blouseStyle: row.blouse_style,
          dupattaStyle: row.dupatta_style,
          silhouette: row.silhouette,
          uniqueIdentifiers: row.unique_identifiers,
          stoneWork: row.stone_work,
          mirrorWork: row.mirror_work,
          zariWork: row.zari_work,
          threadWork: row.thread_work,
          confidence: row.confidence,
          gptDescription: row.gpt_description,
        });
      }
    }

    const fp = await extractBridalInventoryFingerprint(imageBuffer);
    const validation = validateInventoryAiFingerprintPayload(fp);
    if (!validation.ok) {
      throw new Error(`OpenAI fingerprint failed schema validation: ${validation.errors.join("; ")}`);
    }
    await upsertInventoryAiFingerprint({
      itemId,
      imageHash,
      sourceImage: opts.sourceImage,
      fingerprint: validation.data,
      rawStructuredJson: fp,
      model: VLM_MODEL,
      promptVersion: BRIDAL_FP_PROMPT_VERSION,
    });
    console.log(`[openai-forensics] fingerprint stored item=${itemId} conf=${fp.confidence}`);
    return fp;
  } catch (err) {
    console.warn(
      `[openai-forensics] fingerprint skipped item=${itemId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** PHASE 3 — Query understanding (temporary per search). */
export async function understandQueryImage(imageBuffer: Buffer): Promise<GptQueryUnderstanding | null> {
  if (process.env.DRESS_CHECKER_VLM === "0") return null;
  if (process.env.DRESS_CHECKER_GPT_QUERY_TYPE === "0") return null;
  try {
    const b64 = await toBase64(imageBuffer, 512);
    const { text } = await callOpenAiJson("Return JSON only.", [
      { type: "input_text", text: QUERY_TYPE_PROMPT },
      { type: "input_image", image_url: `data:image/jpeg;base64,${b64}` },
    ]);
    const parsed = safeParse(text) as {
      queryType?: string;
      confidence?: number;
      notes?: string;
    } | null;
    if (!parsed?.queryType) return null;
    return {
      queryType: parsed.queryType,
      confidence: Math.round(Number(parsed.confidence) || 0),
      notes: String(parsed.notes || ""),
    };
  } catch (err) {
    console.warn("[openai-forensics] query type failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** PHASE 5–7 — Forensic pairwise verification with sameCollection discrimination. */
export async function forensicVerifyPair(
  queryImage: Buffer,
  catalogImage: Buffer,
  context?: { sku?: string; name?: string },
): Promise<ForensicVerification> {
  const label = context?.sku ? `SKU ${context.sku}` : "catalogue";
  const { text } = await callOpenAiJson(
    "You are a bridal forensic examiner. JSON only. Prefer sameCollection over sameDress for lookalike series.",
    [
      { type: "input_text", text: "Image A — uploaded query." },
      { type: "input_image", image_url: `data:image/jpeg;base64,${await toBase64(queryImage)}` },
      {
        type: "input_text",
        text: `Image B — ${label}${context?.name ? ` ("${context.name}")` : ""}.`,
      },
      { type: "input_image", image_url: `data:image/jpeg;base64,${await toBase64(catalogImage)}` },
      { type: "input_text", text: FORENSIC_PROMPT },
    ],
  );

  const parsed = safeParse(text) as Record<string, unknown> | null;
  if (!parsed) throw new Error("Could not parse forensic verification JSON");

  let sameDress = parsed.sameDress === true;
  const sameCollection = parsed.sameCollection === true;
  // Lookalike series: never treat as same physical dress
  if (sameCollection && sameDress === false) {
    sameDress = false;
  } else if (sameCollection && sameDress) {
    // Model contradiction — prefer collection-only when differences listed
    const diffs = Array.isArray(parsed.differences) ? parsed.differences : [];
    if (diffs.length > 0) sameDress = false;
  }

  const matchedIdentifiers = Array.isArray(parsed.matchedIdentifiers)
    ? parsed.matchedIdentifiers.map((x) => String(x)).filter(Boolean)
    : [];
  if (matchedIdentifiers.length >= 3 && !sameCollection) {
    sameDress = true;
  }

  let confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)));
  if (sameCollection && !sameDress) {
    confidence = Math.min(confidence, 69);
  }
  if (sameDress) {
    confidence = Math.max(confidence, 70);
  }

  return {
    sameDress,
    sameCollection,
    confidence,
    reasoning: String(parsed.reasoning || parsed.reason || ""),
    differences: Array.isArray(parsed.differences)
      ? parsed.differences.map((x) => String(x))
      : [],
    similarities: Array.isArray(parsed.similarities)
      ? parsed.similarities.map((x) => String(x))
      : [],
    matchedIdentifiers,
  };
}

/**
 * Stage 2 soft boost from permanently stored GPT bridal fingerprints.
 * Never calls GPT — only reads inventory_ai_fingerprints.
 * Returns map itemId → delta (−4 … +8).
 */
export async function gptFingerprintBoostsForItems(
  itemIds: number[],
  queryHints: {
    primaryColour?: string | null;
    colourFamily?: string | null;
    motifs?: string[];
    embroideryDensity?: string | null;
    borderType?: string | null;
  },
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!itemIds.length) return map;
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        item_id: number;
        primary_color: string | null;
        color_families: unknown;
        motifs: unknown;
        embroidery_density: string | null;
        border_type: string | null;
        unique_identifiers: unknown;
        stone_work: boolean;
        mirror_work: boolean;
      }>
    >(
      `SELECT item_id, primary_color, color_families, motifs, embroidery_density,
              border_type, unique_identifiers, stone_work, mirror_work
       FROM inventory_ai_fingerprints
       WHERE item_id = ANY($1::int[])`,
      itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    );

    const qMotifs = (queryHints.motifs ?? []).map((m) => m.toLowerCase());
    const qColour = (queryHints.primaryColour || queryHints.colourFamily || "").toLowerCase();
    const qBorder = (queryHints.borderType || "").toLowerCase();
    const qEmb = (queryHints.embroideryDensity || "").toLowerCase();

    for (const row of rows) {
      let delta = 0;
      const motifs = Array.isArray(row.motifs)
        ? row.motifs.map((m) => String(m).toLowerCase())
        : [];
      const families = Array.isArray(row.color_families)
        ? row.color_families.map((f) => String(f).toLowerCase())
        : [];
      const ids = Array.isArray(row.unique_identifiers)
        ? row.unique_identifiers.map((u) => String(u).toLowerCase())
        : [];

      const motifHits = qMotifs.filter((m) =>
        motifs.some((x) => x.includes(m) || m.includes(x)),
      ).length;
      delta += Math.min(4, motifHits * 2);

      if (qColour) {
        const pc = (row.primary_color || "").toLowerCase();
        if (pc.includes(qColour) || qColour.includes(pc) || families.some((f) => f.includes(qColour))) {
          delta += 1;
        }
      }
      if (qBorder && row.border_type && row.border_type.toLowerCase().includes(qBorder.slice(0, 6))) {
        delta += 2;
      }
      if (qEmb && row.embroidery_density && row.embroidery_density.toLowerCase() === qEmb) {
        delta += 1;
      }
      if (ids.length >= 2) delta += 1;
      if (row.stone_work || row.mirror_work) delta += 0; // structural presence only

      map.set(row.item_id, Math.max(-4, Math.min(8, delta)));
    }
  } catch {
    /* table may be empty / missing */
  }
  return map;
}

/** PHASE 10 — Persist search audit (best-effort). */
export async function writeDressSearchAudit(input: {
  searchId: string;
  queryImage?: string | null;
  queryHash?: string | null;
  queryType?: string | null;
  queryTypeConfidence?: number | null;
  candidateIds?: number[];
  embeddingsMeta?: unknown;
  fingerprintsMeta?: unknown;
  gptPrompt?: string | null;
  gptResponse?: unknown;
  gptCalled: boolean;
  gptSkipReason?: string | null;
  stageTimings?: unknown;
  fusionMeta?: unknown;
  dropStages?: unknown;
  finalDecision?: unknown;
  finalItemId?: number | null;
  finalScore?: number | null;
}): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO dress_search_audits (
        search_id, query_image, query_hash, query_type, query_type_confidence,
        candidate_ids, embeddings_meta, fingerprints_meta,
        gpt_prompt, gpt_response, gpt_called, gpt_skip_reason,
        stage_timings, fusion_meta, drop_stages, final_decision, final_item_id, final_score
      ) VALUES (
        ${input.searchId},
        ${input.queryImage ?? null},
        ${input.queryHash ?? null},
        ${input.queryType ?? null},
        ${input.queryTypeConfidence ?? null},
        ${JSON.stringify(input.candidateIds ?? [])}::jsonb,
        ${JSON.stringify(input.embeddingsMeta ?? {})}::jsonb,
        ${JSON.stringify(input.fingerprintsMeta ?? {})}::jsonb,
        ${input.gptPrompt ?? null},
        ${JSON.stringify(input.gptResponse ?? null)}::jsonb,
        ${input.gptCalled},
        ${input.gptSkipReason ?? null},
        ${JSON.stringify(input.stageTimings ?? {})}::jsonb,
        ${JSON.stringify(input.fusionMeta ?? {})}::jsonb,
        ${JSON.stringify(input.dropStages ?? [])}::jsonb,
        ${JSON.stringify(input.finalDecision ?? {})}::jsonb,
        ${input.finalItemId ?? null},
        ${input.finalScore ?? null}
      )
    `;
  } catch (err) {
    console.warn("[openai-forensics] audit write failed:", err instanceof Error ? err.message : err);
  }
}

export { FORENSIC_PROMPT, FINGERPRINT_PROMPT };
