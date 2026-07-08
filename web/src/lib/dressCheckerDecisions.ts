import {
  DRESS_CHECKER_AMBIGUOUS_GAP_PCT,
  DRESS_CHECKER_RELIABLE_THRESHOLD,
} from "./dressCheckerConstants";
import type { DressCheckerDecision, DressCheckerSearchMeta } from "./dressCheckerTypes";
import { recognitionPhotoRef } from "./catalogPhotoRef";

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

export function resolveIdentificationDecision(
  scored: ScoredCandidate[],
  displayName: (name: string, category: string, size: string | null) => string,
): DressCheckerSearchMeta {
  const top = scored[0];
  if (!top) {
    return {
      decision: "no_match",
      requires_manual_confirmation: false,
      ambiguous_match: false,
      message: "No reliable identification found.",
      top_confidence: 0,
      second_confidence: null,
      confidence_gap: null,
      ambiguous_candidates: [],
    };
  }

  const second = scored[1];
  const topConf = top.similarity;
  const secondConf = second?.similarity ?? null;
  const gap = secondConf != null ? topConf - secondConf : null;
  const ambiguous =
    second != null &&
    gap != null &&
    gap < DRESS_CHECKER_AMBIGUOUS_GAP_PCT &&
    topConf >= 50;

  const toCandidate = (s: ScoredCandidate) => ({
    id: s.item.id,
    sku: s.item.sku,
    name: s.item.name,
    display_name: displayName(s.item.name, s.item.category, s.item.size),
    similarity: s.similarity,
    photo: recognitionPhotoRef(s.item) || s.item.photo || "",
  });

  if (topConf < DRESS_CHECKER_RELIABLE_THRESHOLD) {
    return {
      decision: "unreliable",
      requires_manual_confirmation: true,
      ambiguous_match: false,
      message: "No reliable identification found.",
      top_confidence: topConf,
      second_confidence: secondConf,
      confidence_gap: gap,
      ambiguous_candidates: scored.slice(0, 3).map(toCandidate),
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
      ambiguous_candidates: scored.slice(0, 3).map(toCandidate),
    };
  }

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
