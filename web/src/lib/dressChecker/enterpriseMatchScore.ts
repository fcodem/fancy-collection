/**
 * Enterprise cross-view bridal matching — view-invariant identity scoring.
 *
 * Final visual score (PHASE 7):
 *   40% border
 *   20% motif
 *   15% embroidery
 *   10% panel layout
 *   10% embedding
 *   5% colour
 *
 * Colour differences from lighting must NOT reject matches when bridal structure aligns.
 */

import { isViewpointVariationMatch } from "./viewInvariantMatching";
import {
  scoreWithQueryTypeWeights,
  type DressQueryType,
} from "./queryTypeDetection";

export const ENTERPRISE_MATCH_WEIGHTS = {
  border: 0.4,
  motif: 0.2,
  embroidery: 0.15,
  panel: 0.1,
  embedding: 0.1,
  colour: 0.05,
} as const;

/** GPT share when forensic verify runs — calibrated in-band blend (not additive 5%). */
export const ENTERPRISE_GPT_WEIGHT = 0.25;
/** Deterministic structural share when GPT is present. */
export const ENTERPRISE_STRUCTURAL_WEIGHT = 0.75;

/** Visual weight sum — PHASE 7 weights total 1.0 before GPT blend. */
export const ENTERPRISE_VISUAL_WEIGHT_SUM = 1;

/** Soft colour gate — lighting shifts must not hard-reject bridal matches. */
export const ENTERPRISE_REJECT_THRESHOLDS = {
  /** Only reject when colour is extremely different AND structure is weak */
  colourMin: 12,
  embroideryMin: 30,
  stoneMinWhenStonePresent: 30,
} as const;

export const BRIDAL_OVERRIDE_THRESHOLDS = {
  borderMin: 60,
  motifMin: 55,
  identityMin: 80,
  minimumFinalScore: 85,
} as const;

export const ENTERPRISE_DISPLAY_THRESHOLDS = {
  exactMatch: 95,
  highlyLikely: 85,
  possibleMatch: 70,
  minimumDisplay: 70,
} as const;

export type EnterpriseMatchBand =
  | "exact_match"
  | "highly_likely"
  | "possible_match"
  | "below_threshold";

export type EnterpriseComponentInput = {
  embedding: number;
  embroidery: number;
  border: number;
  colour: number;
  texture?: number;
  motif?: number;
  panel?: number;
  stone?: number;
  silhouette?: number;
  identity?: number;
  categoryMismatch?: boolean;
  /** Soft signal only — does not hard-reject when bridal structure is strong */
  dominantColorMismatch?: boolean;
  queryType?: DressQueryType;
};

export type EnterpriseMatchResult = {
  score: number;
  band: EnterpriseMatchBand;
  rejected: boolean;
  rejectReason?: string;
  weights: typeof ENTERPRISE_MATCH_WEIGHTS;
  viewpointVariation?: boolean;
  bridalOverride?: boolean;
  sameDress?: boolean;
};

export function enterpriseMatchBand(score: number): EnterpriseMatchBand {
  if (score >= ENTERPRISE_DISPLAY_THRESHOLDS.exactMatch) return "exact_match";
  if (score >= ENTERPRISE_DISPLAY_THRESHOLDS.highlyLikely) return "highly_likely";
  if (score >= ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch) return "possible_match";
  return "below_threshold";
}

export function enterpriseMatchBandLabel(band: EnterpriseMatchBand): string {
  switch (band) {
    case "exact_match":
      return "Exact match";
    case "highly_likely":
      return "Highly likely same dress";
    case "possible_match":
      return "Possible match — please confirm";
    default:
      return "Different dress";
  }
}

export function computeBridalIdentityCore(input: {
  border: number;
  motif: number;
  embroidery: number;
  panel: number;
}): number {
  return Math.round(
    input.border * 0.4 + input.motif * 0.25 + input.embroidery * 0.2 + input.panel * 0.15,
  );
}

export function isBridalOverrideMatch(input: {
  border: number;
  motif: number;
  identity: number;
  dominantColorMismatch?: boolean;
  colour?: number;
}): boolean {
  // Lighting / saturation shifts must not block bridal override
  if (input.colour != null && input.colour < ENTERPRISE_REJECT_THRESHOLDS.colourMin) {
    return false;
  }
  return (
    input.border > BRIDAL_OVERRIDE_THRESHOLDS.borderMin &&
    input.motif > BRIDAL_OVERRIDE_THRESHOLDS.motifMin &&
    input.identity > BRIDAL_OVERRIDE_THRESHOLDS.identityMin
  );
}

export function computeEnterpriseMatchScore(input: EnterpriseComponentInput): EnterpriseMatchResult {
  const motif = input.motif ?? 0;
  const panel = input.panel ?? input.silhouette ?? 0;
  const identity =
    input.identity ??
    computeBridalIdentityCore({
      border: input.border,
      motif,
      embroidery: input.embroidery,
      panel,
    });

  let score = input.queryType
    ? scoreWithQueryTypeWeights(
        {
          border: input.border,
          motif,
          embroidery: input.embroidery,
          panel,
          embedding: input.embedding,
          colour: input.colour,
        },
        input.queryType,
      )
    : Math.round(
        input.border * 0.4 +
          motif * 0.2 +
          input.embroidery * 0.15 +
          panel * 0.1 +
          input.embedding * 0.1 +
          input.colour * 0.05,
      );

  let rejected = false;
  let rejectReason: string | undefined;

  if (input.categoryMismatch) {
    rejected = true;
    rejectReason = "Category mismatch";
  } else if (
    input.colour < ENTERPRISE_REJECT_THRESHOLDS.colourMin &&
    input.border < 50 &&
    motif < 50
  ) {
    // Only reject colour when decorative structure is also weak (lighting-safe)
    rejected = true;
    rejectReason = `Colour mismatch (${input.colour}%) with weak bridal structure`;
  } else if (
    input.embroidery < ENTERPRISE_REJECT_THRESHOLDS.embroideryMin &&
    input.border < 45 &&
    motif < 45
  ) {
    rejected = true;
    rejectReason = `Embroidery pattern mismatch (${input.embroidery}%)`;
  }

  // dominantColorMismatch is advisory only — never hard-reject alone (lighting)
  void input.dominantColorMismatch;

  const viewpointVariation = isViewpointVariationMatch({
    embedding: input.embedding,
    border: input.border,
    motif,
    panel,
  });

  const bridalOverride = isBridalOverrideMatch({
    border: input.border,
    motif,
    identity,
    colour: input.colour,
  });

  if ((viewpointVariation || bridalOverride) && !input.categoryMismatch) {
    rejected = false;
    rejectReason = undefined;
  }

  score = Math.min(100, Math.max(0, score));
  if (input.categoryMismatch) score = Math.min(score, 30);
  if (rejected) score = Math.min(score, ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch - 1);

  if (viewpointVariation && !input.categoryMismatch) {
    score = Math.max(score, ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch);
  }

  let sameDress = false;
  if (bridalOverride) {
    sameDress = true;
    score = Math.max(score, BRIDAL_OVERRIDE_THRESHOLDS.minimumFinalScore);
  }

  return {
    score,
    band: enterpriseMatchBand(score),
    rejected,
    rejectReason,
    weights: ENTERPRISE_MATCH_WEIGHTS,
    viewpointVariation: viewpointVariation || undefined,
    bridalOverride: bridalOverride || undefined,
    sameDress: sameDress || undefined,
  };
}

export function shouldDisplayEnterpriseMatch(score: number, rejected = false): boolean {
  if (rejected) return false;
  return score >= ENTERPRISE_DISPLAY_THRESHOLDS.minimumDisplay;
}

export type ForensicVerdictKind =
  | "sameDress"
  | "sameCollection"
  | "differentDress"
  | "insufficientEvidence";

export type CalibratedFusionInput = {
  visualScore: number;
  gptScore: number;
  hasGpt: boolean;
  verdict?: ForensicVerdictKind | null;
  gptConfidence?: number;
  /** True when border/motif structure is confirmed incompatible */
  structuralConflict?: boolean;
};

export type CalibratedFusionResult = {
  finalScore: number;
  formula: string;
  displayHint?: string;
};

/**
 * Calibrated decision fusion (Phase 7):
 * - sameDress @≥90: promote with 75/25 blend when structure is credible
 * - sameCollection: cap below exact-match (95)
 * - differentDress @≥90: demote below display when structure agrees
 * - insufficientEvidence: keep deterministic ranking
 * Never use visual + 0.05×GPT.
 */
export function blendEnterpriseWithGpt(
  visualScore: number,
  gptScore: number,
  hasGpt: boolean,
  opts?: Omit<CalibratedFusionInput, "visualScore" | "gptScore" | "hasGpt">,
): number {
  return calibrateEnterpriseGptFusion({
    visualScore,
    gptScore,
    hasGpt,
    ...opts,
  }).finalScore;
}

export function calibrateEnterpriseGptFusion(input: CalibratedFusionInput): CalibratedFusionResult {
  const visual = Math.max(0, Math.min(100, input.visualScore));
  if (!input.hasGpt) {
    return { finalScore: Math.round(visual), formula: `visual=${visual.toFixed(1)} (no GPT)` };
  }

  const gpt = Math.max(0, Math.min(100, input.gptScore));
  const conf = input.gptConfidence ?? gpt;
  const verdict = input.verdict ?? null;
  const sw = ENTERPRISE_STRUCTURAL_WEIGHT;
  const gw = ENTERPRISE_GPT_WEIGHT;

  if (verdict === "sameCollection") {
    const blended = visual * sw + Math.min(gpt, 65) * gw;
    const capped = Math.min(blended, ENTERPRISE_DISPLAY_THRESHOLDS.exactMatch - 1);
    return {
      finalScore: Math.round(Math.min(capped, 84)),
      formula: `sameCollection: min(visual*${sw}+gpt*${gw}, 84) = ${capped.toFixed(1)}`,
      displayHint: "possible related dress — confirm manually",
    };
  }

  if (verdict === "differentDress" && conf >= 90) {
    const demoted = Math.min(visual * 0.55, ENTERPRISE_DISPLAY_THRESHOLDS.minimumDisplay - 1);
    return {
      finalScore: Math.round(demoted),
      formula: `differentDress@${conf}: demote visual*0.55 → ${demoted.toFixed(1)}`,
    };
  }

  if (verdict === "insufficientEvidence") {
    return {
      finalScore: Math.round(visual),
      formula: `insufficientEvidence: retain visual=${visual.toFixed(1)}`,
    };
  }

  if (verdict === "sameDress" && conf >= 90) {
    if (input.structuralConflict) {
      return {
        finalScore: Math.round(Math.min(visual, 69)),
        formula: `sameDress blocked by structuralConflict; cap visual=${Math.min(visual, 69).toFixed(1)}`,
      };
    }
    if (visual < 55) {
      // GPT cannot promote without credible deterministic structure
      const blended = visual * 0.9 + gpt * 0.1;
      return {
        finalScore: Math.round(Math.min(blended, 84)),
        formula: `sameDress weak structure: visual*0.9+gpt*0.1=${blended.toFixed(1)}`,
      };
    }
    const blended = visual * sw + gpt * gw;
    return {
      finalScore: Math.round(Math.min(100, blended)),
      formula: `sameDress: visual*${sw}+gpt*${gw}=${blended.toFixed(1)}`,
    };
  }

  // Default in-band blend for ambiguous verify results
  const blended = visual * sw + gpt * gw;
  return {
    finalScore: Math.round(Math.min(100, blended)),
    formula: `blend: visual*${sw}+gpt*${gw}=${blended.toFixed(1)} verdict=${verdict ?? "n/a"}`,
  };
}
