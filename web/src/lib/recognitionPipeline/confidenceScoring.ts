import { CONFIDENCE_BANDS } from "./constants";
import type { ConfidenceBand } from "./types";
import type { DressCheckerSearchMeta } from "../dressCheckerTypes";
import { recognitionPhotoRef } from "../catalogPhotoRef";

export function scoreToConfidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_BANDS.reliable) return "reliable";
  if (score >= CONFIDENCE_BANDS.veryLikely) return "very_likely";
  if (score >= CONFIDENCE_BANDS.possible) return "possible";
  return "unreliable";
}

export function confidenceBandLabel(band: ConfidenceBand): string {
  switch (band) {
    case "reliable":
      return "Reliable Match";
    case "very_likely":
      return "Very Likely Match";
    case "possible":
      return "Possible Match";
    default:
      return "No reliable identification found.";
  }
}

type ScoredCandidate = {
  similarity: number;
  item: {
    id: number;
    sku: string;
    name: string;
    photo: string | null;
    recognitionImage?: string | null;
    category: string;
    size: string | null;
  };
};

export function resolveHybridDecision(
  scored: ScoredCandidate[],
  displayName: (name: string, category: string, size: string | null) => string,
): DressCheckerSearchMeta {
  const top = scored[0];
  if (!top || top.similarity < CONFIDENCE_BANDS.possible) {
    return {
      decision: "no_match",
      requires_manual_confirmation: false,
      ambiguous_match: false,
      message: "No reliable identification found.",
      top_confidence: top?.similarity ?? 0,
      second_confidence: scored[1]?.similarity ?? null,
      confidence_gap: null,
      ambiguous_candidates: scored.slice(0, 3).map((s) => toCandidate(s, displayName)),
    };
  }

  const second = scored[1];
  const topConf = top.similarity;
  const secondConf = second?.similarity ?? null;
  const gap = secondConf != null ? topConf - secondConf : null;
  const ambiguous = second != null && gap != null && gap < 5 && topConf >= CONFIDENCE_BANDS.possible;

  if (topConf < CONFIDENCE_BANDS.autoSelectMin) {
    return {
      decision: "unreliable",
      requires_manual_confirmation: true,
      ambiguous_match: false,
      message: "No reliable identification found.",
      top_confidence: topConf,
      second_confidence: secondConf,
      confidence_gap: gap,
      ambiguous_candidates: scored.slice(0, 3).map((s) => toCandidate(s, displayName)),
    };
  }

  if (ambiguous) {
    return {
      decision: "ambiguous",
      requires_manual_confirmation: true,
      ambiguous_match: true,
      message: "Multiple possible matches found.",
      top_confidence: topConf,
      second_confidence: secondConf,
      confidence_gap: gap,
      ambiguous_candidates: scored.slice(0, 3).map((s) => toCandidate(s, displayName)),
    };
  }

  if (topConf >= CONFIDENCE_BANDS.reliable) {
    return {
      decision: "identified",
      requires_manual_confirmation: false,
      ambiguous_match: false,
      message: "Dress identified.",
      top_confidence: topConf,
      second_confidence: secondConf,
      confidence_gap: gap,
      ambiguous_candidates: [],
    };
  }

  return {
    decision: "unreliable",
    requires_manual_confirmation: true,
    ambiguous_match: false,
    message: confidenceBandLabel(scoreToConfidenceBand(topConf)),
    top_confidence: topConf,
    second_confidence: secondConf,
    confidence_gap: gap,
    ambiguous_candidates: scored.slice(0, 3).map((s) => toCandidate(s, displayName)),
  };
}

function toCandidate(
  s: ScoredCandidate,
  displayName: (name: string, category: string, size: string | null) => string,
) {
  return {
    id: s.item.id,
    sku: s.item.sku,
    name: s.item.name,
    display_name: displayName(s.item.name, s.item.category, s.item.size),
    similarity: s.similarity,
    photo: recognitionPhotoRef(s.item) || s.item.photo || "",
  };
}
