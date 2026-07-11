/**
 * Dress Checker index fields on inventory_ai_profiles.
 * Backward-compatible: reads legacy `error` when `processingError` is unset;
 * treats `imageEmbeddingJson` as embedding fallback when pgvector is unavailable.
 */

export type DressCheckerVerificationMetadata = {
  lastSearchId?: string;
  lastMatchScore?: number;
  verifiedAt?: string;
  verifyModel?: string;
  candidateCount?: number;
  [key: string]: unknown;
};

export type DressCheckerEmbeddingSource = "pgvector" | "json_fallback" | "none";

/** Columns added for Dress Checker vector + hash indexing. */
export type InventoryAiProfileDressCheckerFields = {
  photoHash: string | null;
  differenceHash: string | null;
  colorHistogram: number[] | null;
  verificationMetadata: DressCheckerVerificationMetadata | null;
  processingError: string | null;
  reindexedAt: string | null;
  hasEmbedding: boolean;
  embeddingSource: DressCheckerEmbeddingSource;
};

export type DressCheckerProfileRowInput = {
  photoHash?: string | null;
  differenceHash?: string | null;
  colorHistogram?: unknown;
  verificationMetadata?: unknown;
  processingError?: string | null;
  error?: string | null;
  reindexedAt?: Date | string | null;
  imageEmbeddingJson?: unknown;
};

export function parseColorHistogram(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  return value.every((v) => typeof v === "number") ? (value as number[]) : null;
}

export function parseVerificationMetadata(
  value: unknown,
): DressCheckerVerificationMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as DressCheckerVerificationMetadata;
}

/** Prefer dress-checker processingError; fall back to legacy error column. */
export function resolveProcessingError(row: {
  processingError?: string | null;
  error?: string | null;
}): string | null {
  const msg = row.processingError?.trim() || row.error?.trim();
  return msg || null;
}

export function resolveEmbeddingSource(
  hasPgvectorEmbedding: boolean,
  imageEmbeddingJson: unknown,
): DressCheckerEmbeddingSource {
  if (hasPgvectorEmbedding) return "pgvector";
  if (Array.isArray(imageEmbeddingJson) && imageEmbeddingJson.length > 0) {
    return "json_fallback";
  }
  return "none";
}

export function toDressCheckerFields(
  row: DressCheckerProfileRowInput,
  hasPgvectorEmbedding = false,
): InventoryAiProfileDressCheckerFields {
  const reindexed =
    row.reindexedAt instanceof Date
      ? row.reindexedAt.toISOString()
      : typeof row.reindexedAt === "string"
        ? row.reindexedAt
        : null;

  return {
    photoHash: row.photoHash ?? null,
    differenceHash: row.differenceHash ?? null,
    colorHistogram: parseColorHistogram(row.colorHistogram),
    verificationMetadata: parseVerificationMetadata(row.verificationMetadata),
    processingError: resolveProcessingError(row),
    reindexedAt: reindexed,
    hasEmbedding:
      hasPgvectorEmbedding ||
      (Array.isArray(row.imageEmbeddingJson) && row.imageEmbeddingJson.length > 0),
    embeddingSource: resolveEmbeddingSource(hasPgvectorEmbedding, row.imageEmbeddingJson),
  };
}
