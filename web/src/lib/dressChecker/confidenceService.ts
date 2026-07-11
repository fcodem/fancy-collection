import { CONFIDENCE_THRESHOLDS } from "./constants";



import type { DressCheckerSearchMeta } from "../dressCheckerTypes";



import { dressDisplayName } from "../dress";



import type { RankedCandidate } from "./types";



import { recognitionPhotoRef } from "../catalogPhotoRef";







export type ConfidenceBand = "same_dress" | "very_likely" | "possible" | "unreliable";







export function scoreToBand(score: number): ConfidenceBand {



  if (score >= CONFIDENCE_THRESHOLDS.sameDress) return "same_dress";



  if (score >= CONFIDENCE_THRESHOLDS.veryLikely) return "very_likely";



  if (score >= CONFIDENCE_THRESHOLDS.possible) return "possible";



  return "unreliable";



}







export function bandLabel(band: ConfidenceBand): string {
  switch (band) {
    case "same_dress":
      return "Exact match";
    case "very_likely":
      return "Highly likely same dress";
    case "possible":
      return "Possible match — please confirm";
    default:
      return "No reliable match found.";
  }
}







export function resolveSearchDecision(



  results: RankedCandidate[],



  displayName = dressDisplayName,



  identityVerified = true,



): DressCheckerSearchMeta {



  const top = results[0];



  if (!top || top.identity.final < CONFIDENCE_THRESHOLDS.possible) {



    return {



      decision: "no_match",



      requires_manual_confirmation: true,



      ambiguous_match: false,



      message: "No reliable match found.",



      top_confidence: top?.identity.final ?? 0,



      second_confidence: results[1]?.identity.final ?? null,



      confidence_gap: null,



      ambiguous_candidates: results.slice(0, 5).map((r) => toCandidate(r, displayName)),



    };



  }







  const second = results[1];



  const gap = second ? top.identity.final - second.identity.final : null;



  const ambiguous =



    second != null && gap != null && gap < 8 && top.identity.final >= CONFIDENCE_THRESHOLDS.possible;







  /**
   * Identity engine (OpenAI Vision) is OFF — embeddings alone cannot be trusted to
   * confirm a specific garment. Never auto-identify; always ask staff to confirm
   * against the shortlisted candidates instead of showing a confident wrong label.
   */
  if (!identityVerified) {
    return {
      decision: "unreliable",
      requires_manual_confirmation: true,
      ambiguous_match: false,
      message: "AI identity engine is off — confirm manually (set OPENAI_API_KEY).",
      top_confidence: top.identity.final,
      second_confidence: second?.identity.final ?? null,
      confidence_gap: gap,
      ambiguous_candidates: results.slice(0, 5).map((r) => toCandidate(r, displayName)),
    };
  }

  /** >95% — automatically identify */



  if (top.identity.final >= CONFIDENCE_THRESHOLDS.sameDress && !ambiguous) {



    return {



      decision: "identified",



      requires_manual_confirmation: false,



      ambiguous_match: false,



      message: bandLabel("same_dress"),



      top_confidence: top.identity.final,



      second_confidence: second?.identity.final ?? null,



      confidence_gap: gap,



      ambiguous_candidates: [],



    };



  }







  if (ambiguous) {



    return {



      decision: "ambiguous",



      requires_manual_confirmation: true,



      ambiguous_match: true,



      message: "Multiple possible matches found.",



      top_confidence: top.identity.final,



      second_confidence: second?.identity.final ?? null,



      confidence_gap: gap,



      ambiguous_candidates: results.slice(0, 5).map((r) => toCandidate(r, displayName)),



    };



  }







  /** 90–95% — ask confirmation */



  if (top.identity.final >= CONFIDENCE_THRESHOLDS.veryLikely) {



    return {



      decision: "unreliable",



      requires_manual_confirmation: true,



      ambiguous_match: false,



      message: bandLabel("very_likely"),



      top_confidence: top.identity.final,



      second_confidence: second?.identity.final ?? null,



      confidence_gap: gap,



      ambiguous_candidates: [toCandidate(top, displayName)],



    };



  }







  /** <90% — show top five */



  return {



    decision: "unreliable",



    requires_manual_confirmation: true,



    ambiguous_match: false,



    message: bandLabel(scoreToBand(top.identity.final)),



    top_confidence: top.identity.final,



    second_confidence: second?.identity.final ?? null,



    confidence_gap: gap,



    ambiguous_candidates: results.slice(0, 5).map((r) => toCandidate(r, displayName)),



  };



}







function toCandidate(



  r: RankedCandidate,



  displayName: (name: string, category: string, size: string | null) => string,



) {



  return {



    id: r.itemId,



    sku: r.sku,



    name: r.name,



    display_name: displayName(r.name, r.category, r.size),



    similarity: r.identity.final,



    photo: recognitionPhotoRef({ recognitionImage: r.recognitionImage, photo: r.photo }) || r.photo || "",



  };



}


