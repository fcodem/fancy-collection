import type { DressCheckerDecision } from "./dressCheckerTypes";

export type DressCheckerLogEntry = {
  timestamp: string;
  event: "search" | "reindex" | "reindex_clear" | "correction" | "error";
  searchDurationMs?: number;
  embeddingDurationMs?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageBytes?: number;
  modelId?: string;
  embeddingVersion?: number;
  preprocessingVersion?: number;
  embeddingDimension?: number;
  topPredictionSku?: string;
  topConfidence?: number;
  secondPredictionSku?: string;
  secondConfidence?: number;
  decision?: DressCheckerDecision;
  requiresManualConfirmation?: boolean;
  itemId?: number;
  sku?: string;
  reason?: string;
  error?: string;
  warning?: string;
  identityEngine?: "vlm+embedding" | "embedding_only";
};

function loggingEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DRESS_CHECKER_DEBUG === "1";
}

export function logDressChecker(entry: DressCheckerLogEntry): void {
  if (!loggingEnabled()) return;
  const line = JSON.stringify({ service: "dress-checker", ...entry });
  if (entry.event === "error") {
    console.error(line);
  } else if (entry.warning) {
    console.warn(line);
  } else {
    console.info(line);
  }
}
