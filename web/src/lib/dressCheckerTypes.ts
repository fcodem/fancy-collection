export type DressCheckerDecision =
  | "identified"
  | "ambiguous"
  | "unreliable"
  | "no_match"
  | "error";

export type DressCheckerSearchMeta = {
  decision: DressCheckerDecision;
  requires_manual_confirmation: boolean;
  ambiguous_match: boolean;
  message: string;
  top_confidence: number;
  second_confidence: number | null;
  confidence_gap: number | null;
  ambiguous_candidates: Array<{
    id: number;
    sku: string;
    name: string;
    display_name: string;
    similarity: number;
    photo: string;
  }>;
};

export type DressCheckerCorrectionInput = {
  correctItemId?: number | null;
  rejectedItemId?: number | null;
  predictedItemId?: number | null;
  predictedSku?: string | null;
  confidence?: number | null;
  hybridScore?: number | null;
  featureComparison?: Record<string, unknown> | null;
  searchId?: string | null;
  feedbackType?: "positive" | "negative";
};
