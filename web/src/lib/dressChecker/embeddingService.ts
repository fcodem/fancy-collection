import { cosineSimilarity, cosineToPercent } from "../siglipMath";
import type { RegionEmbeddings } from "../dressIdentificationTypes";

export async function embedQueryImage(buffer: Buffer): Promise<RegionEmbeddings> {
  const { buildQueryFingerprints } = await import("../dressIdentificationIndex");
  const refs = await buildQueryFingerprints(buffer);
  const primary = refs[0];
  if (!primary?.embeddings) throw new Error("Failed to generate query embeddings");
  return primary.embeddings;
}

export async function embedInventoryImage(buffer: Buffer): Promise<number[]> {
  const { generateImageEmbedding } = await import("../siglipModel");
  return generateImageEmbedding(buffer);
}

export function embeddingSimilarityPercent(
  query: RegionEmbeddings | null,
  stored: RegionEmbeddings | null,
): number {
  if (!query?.global?.length || !stored?.global?.length) return 0;
  return cosineToPercent(cosineSimilarity(query.global, stored.global));
}
