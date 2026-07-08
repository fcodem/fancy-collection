/**
 * Duplicate inventory detection — compare new photo fingerprint against catalog.
 */
import { analyzeQueryImage } from "./processQuery";
import { loadCatalogCandidates } from "./catalog";
import { matchGarmentIdentity } from "./identityMatcher";
import { DUPLICATE_SIMILARITY_THRESHOLD } from "./constants";

export type DuplicateMatch = {
  itemId: number;
  sku: string;
  name: string;
  category: string;
  photo: string;
  similarity: number;
  componentScores: {
    global: number;
    embroidery: number;
    border: number;
    motifs: number;
    colour: number;
    texture: number;
    silhouette: number;
    final: number;
  };
};

export type DuplicateCheckResult = {
  isDuplicate: boolean;
  threshold: number;
  bestMatch: DuplicateMatch | null;
  checkedCount: number;
};

/** Compare uploaded image against all indexed inventory fingerprints. */
export async function checkInventoryDuplicate(
  imageBuffer: Buffer,
  category?: string,
  excludeItemId?: number,
): Promise<DuplicateCheckResult> {
  const query = await analyzeQueryImage(imageBuffer, undefined, { category });
  const { candidates } = await loadCatalogCandidates({});

  let best: DuplicateMatch | null = null;

  for (const c of candidates) {
    if (excludeItemId && c.itemId === excludeItemId) continue;
    if (!c.identificationIndex?.references?.length) continue;

    const identity = matchGarmentIdentity(
      query.queryFingerprints,
      query.fingerprint,
      c.identificationIndex,
      c.fingerprint,
      c.name,
      c.color,
      query.partialView ?? "full",
    );

    if (!best || identity.final > best.similarity) {
      best = {
        itemId: c.itemId,
        sku: c.sku,
        name: c.name,
        category: c.category,
        photo: c.photo || "",
        similarity: identity.final,
        componentScores: {
          global: identity.deepEmbedding,
          embroidery: identity.embroidery,
          border: identity.border,
          motifs: identity.motifs,
          colour: identity.colour,
          texture: identity.texture,
          silhouette: identity.silhouette,
          final: identity.final,
        },
      };
    }
  }

  return {
    isDuplicate: (best?.similarity ?? 0) >= DUPLICATE_SIMILARITY_THRESHOLD,
    threshold: DUPLICATE_SIMILARITY_THRESHOLD,
    bestMatch: best,
    checkedCount: candidates.length,
  };
}
