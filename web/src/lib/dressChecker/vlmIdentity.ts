/**
 * OpenAI Vision — bridal forensic verification ONLY (never primary search).
 *
 * Pipeline: embeddings → fingerprints → region rerank → GPT only for ambiguous 70–92 band.
 */
import { resolveOpenAiKey } from "@/lib/ai/aiRuntimeSettings";
import {
  forensicVerifyPair,
  OPENAI_USAGE_POLICY,
  shouldCallOpenAiForScore,
} from "./openaiBridalForensics";

export const OPENAI_VERIFY_TOP_N = OPENAI_USAGE_POLICY.verifyTopN;
const VLM_MODEL = process.env.DRESS_CHECKER_VLM_MODEL || "gpt-4o";

/** GPT confidence bands for Indian bridal rental matching. */
export const OPENAI_VERIFY_CONFIDENCE = {
  sameDress: 95,
  veryLikely: 85,
  possibleMatch: 70,
  differentDress: 70,
  minBridalIdentifiers: 3,
  autoAcceptMin: OPENAI_USAGE_POLICY.autoAcceptMin,
  gptMin: OPENAI_USAGE_POLICY.gptMin,
  gptMax: OPENAI_USAGE_POLICY.gptMax,
} as const;

export type VlmCandidateImage = Buffer;

export type VlmCandidate = {
  itemId: number;
  sku: string;
  name: string;
  images: VlmCandidateImage[];
  /** Pre-GPT enterprise score — used for usage policy gating */
  preGptScore?: number;
};

export type OpenAiGarmentVerification = {
  sameDress: boolean;
  sameCollection: boolean;
  confidence: number;
  reasoning: string;
  differences: string[];
  similarities: string[];
  matchedIdentifiers: string[];
  exactMatch: boolean;
  reasons: string[];
};

export type VlmPerCandidate = {
  itemId: number;
  sku: string;
  sameDress: boolean;
  sameCollection: boolean;
  confidence: number;
  notes: string;
  exactMatch: boolean;
  reasoning: string;
  differences: string[];
  similarities: string[];
  reasons: string[];
  matchedIdentifiers: string[];
  skipped?: boolean;
  skipReason?: string;
};

export type VlmVerdict = {
  usedVlm: boolean;
  matchItemId: number | null;
  confidence: number;
  reasoning: string;
  perCandidate: VlmPerCandidate[];
  error?: string;
  autoAcceptedIds?: number[];
  rejectedWithoutGptIds?: number[];
};

export function isVlmAvailable(): boolean {
  return process.env.DRESS_CHECKER_VLM !== "0";
}

export { shouldCallOpenAiForScore, OPENAI_USAGE_POLICY };

/**
 * Pairwise forensic verification — bridal forensic examiner prompt.
 */
export async function verifyGarmentPair(
  imageA: Buffer,
  imageB: Buffer,
  context?: { sku?: string; name?: string },
): Promise<OpenAiGarmentVerification> {
  await resolveOpenAiKey();
  const verdict = await forensicVerifyPair(imageA, imageB, context);
  return {
    sameDress: verdict.sameDress,
    sameCollection: verdict.sameCollection,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
    differences: verdict.differences,
    similarities: verdict.similarities,
    matchedIdentifiers: verdict.matchedIdentifiers,
    exactMatch: verdict.sameDress,
    reasons: verdict.differences.length ? verdict.differences : [verdict.reasoning],
  };
}

/**
 * Verify ambiguous candidates only (score 70–92). Auto-accept >92, reject <70 without GPT.
 */
export async function verifyDressIdentity(
  queryImage: Buffer,
  candidates: VlmCandidate[],
): Promise<VlmVerdict> {
  const shortlist = candidates.slice(0, OPENAI_VERIFY_TOP_N);
  if (!isVlmAvailable() || shortlist.length === 0) {
    return {
      usedVlm: false,
      matchItemId: null,
      confidence: 0,
      reasoning: "OpenAI verification disabled or no candidates",
      perCandidate: [],
    };
  }

  console.log(`OPENAI FORENSIC START candidates=${shortlist.length} model=${VLM_MODEL}`);
  const verifyStarted = Date.now();
  const perCandidate: VlmPerCandidate[] = [];
  const autoAcceptedIds: number[] = [];
  const rejectedWithoutGptIds: number[] = [];

  try {
    for (let i = 0; i < shortlist.length; i++) {
      const c = shortlist[i]!;
      const imageB = c.images[0];
      if (!imageB) continue;

      const pre = c.preGptScore ?? 80;
      const policy = shouldCallOpenAiForScore(pre);

      if (policy === "auto_accept") {
        autoAcceptedIds.push(c.itemId);
        perCandidate.push({
          itemId: c.itemId,
          sku: c.sku,
          sameDress: true,
          sameCollection: false,
          confidence: Math.max(pre, OPENAI_USAGE_POLICY.autoAcceptMin),
          notes: `Auto-accepted (score ${pre} > ${OPENAI_USAGE_POLICY.autoAcceptMin}) — GPT skipped`,
          exactMatch: true,
          reasoning: `Auto-accepted (score ${pre} > ${OPENAI_USAGE_POLICY.autoAcceptMin}) — GPT skipped`,
          differences: [],
          similarities: ["high enterprise score"],
          reasons: [],
          matchedIdentifiers: [],
          skipped: true,
          skipReason: "auto_accept",
        });
        continue;
      }

      if (policy === "reject") {
        rejectedWithoutGptIds.push(c.itemId);
        perCandidate.push({
          itemId: c.itemId,
          sku: c.sku,
          sameDress: false,
          sameCollection: false,
          confidence: Math.min(pre, OPENAI_USAGE_POLICY.rejectBelow - 1),
          notes: `Rejected without GPT (score ${pre} < ${OPENAI_USAGE_POLICY.rejectBelow})`,
          exactMatch: false,
          reasoning: `Rejected without GPT (score ${pre} < ${OPENAI_USAGE_POLICY.rejectBelow})`,
          differences: ["below_threshold"],
          similarities: [],
          reasons: ["below_threshold"],
          matchedIdentifiers: [],
          skipped: true,
          skipReason: "reject_below_threshold",
        });
        continue;
      }

      const pairStarted = Date.now();
      console.log(
        `OPENAI FORENSIC pair ${i + 1}/${shortlist.length} item=${c.itemId} sku=${c.sku} pre=${pre}`,
      );

      try {
        const verdict = await verifyGarmentPair(queryImage, imageB, {
          sku: c.sku,
          name: c.name,
        });
        perCandidate.push({
          itemId: c.itemId,
          sku: c.sku,
          sameDress: verdict.sameDress,
          sameCollection: verdict.sameCollection,
          confidence: verdict.confidence,
          notes: verdict.reasoning,
          exactMatch: verdict.sameDress,
          reasoning:
            verdict.sameCollection && !verdict.sameDress
              ? `sameCollection (lookalike): ${verdict.reasoning}`
              : verdict.reasoning,
          differences: verdict.differences,
          similarities: verdict.similarities,
          reasons: verdict.reasons,
          matchedIdentifiers: verdict.matchedIdentifiers,
        });
        console.log(
          `OPENAI FORENSIC COMPLETE item=${c.itemId} sameDress=${verdict.sameDress} sameCollection=${verdict.sameCollection} conf=${verdict.confidence} ms=${Date.now() - pairStarted}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "verification failed";
        console.error(`OPENAI FORENSIC FAILED item=${c.itemId}:`, msg);
        perCandidate.push({
          itemId: c.itemId,
          sku: c.sku,
          sameDress: false,
          sameCollection: false,
          confidence: 0,
          notes: msg,
          exactMatch: false,
          reasoning: msg,
          differences: [msg],
          similarities: [],
          reasons: [msg],
          matchedIdentifiers: [],
        });
      }
    }

    const matches = perCandidate.filter((p) => p.sameDress && !p.sameCollection);
    matches.sort((a, b) => b.confidence - a.confidence);
    const best = matches[0] ?? null;

    console.log(
      `OPENAI FORENSIC DONE matches=${matches.length} best=${best?.itemId ?? "none"} auto=${autoAcceptedIds.length} rejectSkip=${rejectedWithoutGptIds.length} ms=${Date.now() - verifyStarted}`,
    );

    return {
      usedVlm: perCandidate.some((p) => !p.skipped),
      matchItemId: best?.itemId ?? autoAcceptedIds[0] ?? null,
      confidence: best?.confidence ?? (autoAcceptedIds.length ? 93 : 0),
      reasoning:
        best?.reasoning ||
        (autoAcceptedIds.length
          ? "Auto-accepted high-confidence enterprise match"
          : "No exact physical garment match confirmed"),
      perCandidate,
      autoAcceptedIds,
      rejectedWithoutGptIds,
    };
  } catch (err) {
    return {
      usedVlm: false,
      matchItemId: null,
      confidence: 0,
      reasoning: "OpenAI verification error",
      perCandidate,
      error: err instanceof Error ? err.message : "openai_verify_failed",
    };
  }
}

/** Exported for unit tests. */
export function parseVerificationPayload(raw: string): OpenAiGarmentVerification | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    let sameDress = parsed.sameDress === true;
    const sameCollection = parsed.sameCollection === true;
    const differences = Array.isArray(parsed.differences)
      ? parsed.differences.map((x) => String(x))
      : [];
    const matchedIdentifiers = Array.isArray(parsed.matchedIdentifiers)
      ? parsed.matchedIdentifiers.map((x) => String(x))
      : [];
    // Lookalike series (e.g. ONION BRIDAL / ONION BRIDAL 2) must never merge
    if (sameCollection) {
      sameDress = false;
    } else if (matchedIdentifiers.length >= 3) {
      sameDress = true;
    }
    let confidence = Math.round(Number(parsed.confidence) || 0);
    if (sameCollection) confidence = Math.min(confidence, 69);
    if (sameDress) {
      confidence = Math.max(confidence, OPENAI_VERIFY_CONFIDENCE.possibleMatch);
    } else {
      // Non-matches / colour-only must stay below possible-match band
      confidence = Math.min(confidence, OPENAI_VERIFY_CONFIDENCE.possibleMatch - 1);
    }
    return {
      sameDress,
      sameCollection,
      confidence,
      reasoning: String(parsed.reasoning || parsed.reason || ""),
      differences,
      similarities: Array.isArray(parsed.similarities)
        ? parsed.similarities.map((x) => String(x))
        : [],
      matchedIdentifiers,
      exactMatch: sameDress && !sameCollection,
      reasons: differences,
    };
  } catch {
    return null;
  }
}
