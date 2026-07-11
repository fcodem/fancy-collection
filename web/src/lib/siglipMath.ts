/** SigLIP base patch16 224 vision embedding dimension. */
export const SIGLIP_EMBEDDING_DIM = 768;

/** Cosine similarity for same-length vectors (returns -1..1). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/** Map raw cosine similarity to a 0–100 display percentage. */
export function cosineToPercent(cosine: number): number {
  const clamped = Math.max(0, Math.min(1, cosine));
  return Math.round(clamped * 100);
}

export type ConfidenceLevel = {
  stars: string;
  label: string;
  reliable: boolean;
  matchLabel: string;
};

/** Enterprise dress checker confidence tiers for UI. */
export function mapConfidence(similarityPct: number): ConfidenceLevel {
  if (similarityPct >= 95) {
    return { stars: "★★★★★", label: "Exact", reliable: true, matchLabel: "Exact match" };
  }
  if (similarityPct >= 85) {
    return { stars: "★★★★", label: "Highly likely", reliable: true, matchLabel: "Highly likely same dress" };
  }
  if (similarityPct >= 75) {
    return { stars: "★★★", label: "Possible", reliable: false, matchLabel: "Possible match — please confirm" };
  }
  return { stars: "", label: "Below threshold", reliable: false, matchLabel: "Below threshold" };
}
