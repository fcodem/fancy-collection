import prisma from "../prisma";
import { cosineSimilarity, cosineToPercent, type ConfidenceLevel } from "../siglipMath";
import {
  buildQueryFingerprints,
  buildIdentificationIndex,
  computeContentHash,
  needsIndexRefresh,
  parseIdentificationIndex,
} from "../dressIdentificationIndex";
import {
  IDENTIFICATION_INDEX_VERSION,
  type CategoryDetectionResult,
  type ComponentScores,
  type IdentificationIndex,
  type MatchDebugInfo,
} from "../dressIdentificationTypes";
import { loadPhotoBuffer } from "./siglipSearch";
import { SIGLIP_MODEL_ID } from "../siglipPreprocess";
import type { DressCheckerDebugPayload } from "../dressCheckerDebug";
import { logDressChecker } from "../dressCheckerLog";
import { PREPROCESSING_VERSION } from "../dressCheckerConstants";
import type { DressCheckerSearchMeta } from "../dressCheckerTypes";

export type IdentificationSearchFilters = {
  category?: string;
  size?: string;
  color?: string;
  gender?: "" | "mens" | "womens";
  status?: string;
  designer?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type IdentificationResultItem = {
  id: number;
  name: string;
  display_name: string;
  sku: string;
  category: string;
  status: string;
  size: string;
  color: string;
  photo: string;
  daily_rate: number;
  sub_category: string;
  inventory_location: string;
  similarity: number;
  confidence: ConfidenceLevel;
  rank_reason?: string;
  match_explanation?: {
    embroidery: number;
    border: number;
    texture: number;
    silhouette: number;
    motifs: number;
    colour: number;
    overall: number;
    summary: string;
  };
  component_scores?: ComponentScores;
  best_reference?: { refId: string; label: string; querySource: string };
  identification_debug?: MatchDebugInfo[];
};

export type IdentificationSearchResponse = {
  ok: true;
  category: string;
  detected_category?: string;
  category_detection?: CategoryDetectionResult;
  category_results: IdentificationResultItem[];
  other_results: IdentificationResultItem[];
  used_fallback: boolean;
  results: IdentificationResultItem[];
  search_engine: "identification";
  best_similarity: number;
  reliable_identification: boolean;
  identification_meta?: DressCheckerSearchMeta;
  image_warnings?: string[];
  pipeline_stages?: {
    stage_a_category: string;
    stage_b_candidates: number;
    stage_c_scored: number;
  };
  dress_checker_debug?: DressCheckerDebugPayload;
};

/** Stage A: detect garment category from query vs catalog prototypes. */
export function detectCategory(
  queries: Awaited<ReturnType<typeof buildQueryFingerprints>>,
  items: Array<{ category: string; index: IdentificationIndex }>,
): CategoryDetectionResult {
  const categoryBuckets = new Map<string, number[]>();

  for (const item of items) {
    const ref = item.index.references[0];
    if (!ref?.embeddings.global.length) continue;
    let best = 0;
    for (const query of queries) {
      best = Math.max(best, cosineSimilarity(query.embeddings.global, ref.embeddings.global));
    }
    const pct = cosineToPercent(best);
    const bucket = categoryBuckets.get(item.category) || [];
    bucket.push(pct);
    categoryBuckets.set(item.category, bucket);
  }

  const scores: Record<string, number> = {};
  let bestCategory = "";
  let bestScore = 0;
  for (const [cat, values] of categoryBuckets) {
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    scores[cat] = avg;
    if (avg > bestScore) {
      bestScore = avg;
      bestCategory = cat;
    }
  }

  return { category: bestCategory, confidence: bestScore, scores };
}

const reindexPending = new Set<number>();

export async function indexIdentificationFingerprint(
  itemId: number,
  photo: string,
  category: string,
  extraBuffers: Array<{ buffer: Buffer; refId: string; label: string }> = [],
): Promise<boolean> {
  const buf = await loadPhotoBuffer(photo);
  if (!buf) return false;

  const contentHash = computeContentHash(buf);
  const itemRow = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { identificationIndex: true, name: true, color: true },
  });
  const parsed = parseIdentificationIndex(itemRow?.identificationIndex);
  if (!needsIndexRefresh(parsed, contentHash) && !extraBuffers.length) return true;

  const inventoryName = itemRow?.name || "";
  const inventoryColor = itemRow?.color || null;

  const refPhotos = await prisma.clothingItemReferencePhoto.findMany({
    where: { itemId },
    orderBy: { sortOrder: "asc" },
    select: { photo: true, label: true, id: true },
  });

  const buffers: Array<{ buffer: Buffer; refId: string; label: string }> = [
    { buffer: buf, refId: "primary", label: "primary" },
    ...extraBuffers,
  ];

  for (const ref of refPhotos) {
    const refBuf = await loadPhotoBuffer(ref.photo);
    if (refBuf) {
      buffers.push({
        buffer: refBuf,
        refId: `ref_${ref.id}`,
        label: ref.label || `reference_${ref.id}`,
      });
    }
  }

  const index = await buildIdentificationIndex(buffers, category, inventoryName, inventoryColor);

  const { serializeStoredEmbeddings } = await import("../siglipModel");
  const legacyEmbeddings = index.references.map((r) => r.embeddings.global);

  await prisma.clothingItem.update({
    where: { id: itemId },
    data: {
      identificationIndex: index,
      identificationIndexedAt: new Date(),
      siglipEmbedding: serializeStoredEmbeddings(legacyEmbeddings),
      siglipIndexedAt: new Date(),
    },
  });
  return true;
}

export function scheduleIdentificationIndexing(
  itemId: number,
  photo: string | null | undefined,
  category: string,
  reason = "scheduled",
) {
  if (!photo) return;
  if (reindexPending.has(itemId)) return;
  reindexPending.add(itemId);
  setImmediate(() => {
    void (async () => {
      const started = Date.now();
      try {
        await indexIdentificationFingerprint(itemId, photo, category);
        logDressChecker({
          timestamp: new Date().toISOString(),
          event: "reindex",
          itemId,
          reason,
          embeddingDurationMs: Date.now() - started,
          modelId: SIGLIP_MODEL_ID,
          embeddingVersion: IDENTIFICATION_INDEX_VERSION,
          preprocessingVersion: PREPROCESSING_VERSION,
        });
      } catch (err) {
        logDressChecker({
          timestamp: new Date().toISOString(),
          event: "error",
          itemId,
          error: err instanceof Error ? err.message : "Reindex failed",
          reason,
        });
      } finally {
        reindexPending.delete(itemId);
      }
    })();
  });
}

/** Photo search — delegates to dress checker v3 engine. */
export async function identificationPhotoSearch(
  photoBuffer: Buffer,
  filters: IdentificationSearchFilters = {},
  options: { debug?: boolean } = {},
): Promise<IdentificationSearchResponse> {
  const { searchDressesByPhoto } = await import("../dressChecker/search");
  const result = await searchDressesByPhoto(photoBuffer, filters, options);
  return {
    ok: true,
    category: result.category,
    category_results: result.category_results as IdentificationResultItem[],
    other_results: result.other_results as IdentificationResultItem[],
    used_fallback: result.used_fallback,
    results: result.results as IdentificationResultItem[],
    search_engine: "identification",
    best_similarity: result.best_similarity,
    reliable_identification: result.reliable_identification,
    identification_meta: result.identification_meta,
    image_warnings: result.image_warnings,
    dress_checker_debug: result.dress_checker_debug as IdentificationSearchResponse["dress_checker_debug"],
  };
}
