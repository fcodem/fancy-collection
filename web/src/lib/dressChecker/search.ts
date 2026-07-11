import { dressDisplayName } from "../dress";
import { mapConfidence } from "../siglipMath";
import { recognitionPhotoRef } from "../catalogPhotoRef";
import { imageDimensions, SIGLIP_MODEL_ID, SIGLIP_EMBEDDING_DIM } from "../siglipPreprocess";
import { PREPROCESSING_VERSION } from "../dressCheckerConstants";
import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";
import { logDressChecker } from "../dressCheckerLog";
import type { DressCheckerDebugPayload } from "../dressCheckerDebug";
import { analyzeQueryImage } from "./processQuery";
import { loadCatalogCandidates, type CatalogFilters } from "./catalog";
import { retrieveCandidates } from "./candidateRetrieval";
import { rerankCandidates, selectFinalResults } from "./rerankingService";
import { resolveSearchDecision } from "./confidenceService";
import { DRESS_CHECKER_ENGINE_VERSION } from "./constants";
import { applyVlmVerification, type VlmVerificationOutcome } from "./vlmRerank";
import type { RankedCandidate, RejectedCandidate } from "./types";

export type DressCheckerSearchOptions = {
  debug?: boolean;
  category?: string;
};

export type DressCheckerResultItem = {
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
  confidence: ReturnType<typeof mapConfidence>;
  rank_reason: string;
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
  component_scores?: {
    global: number;
    border: number;
    blouse: number;
    skirt: number;
    embroidery: number;
    texture: number;
    motifs: number;
    silhouette: number;
    color: number;
    metadataColor: number;
    weighted: number;
  };
  best_reference?: { refId: string; label: string; querySource: string };
};

export type DressCheckerSearchResult = {
  ok: true;
  category: string;
  category_results: DressCheckerResultItem[];
  other_results: DressCheckerResultItem[];
  used_fallback: boolean;
  results: DressCheckerResultItem[];
  search_engine: "identification";
  best_similarity: number;
  reliable_identification: boolean;
  identification_meta: ReturnType<typeof resolveSearchDecision>;
  image_warnings?: string[];
  dress_checker_debug?: DressCheckerDebugPayload & {
    engineVersion: number;
    queryViewCount: number;
    detectedGarment?: Record<string, unknown>;
    rejectedCandidates?: RejectedCandidate[];
    vlm?: {
      used: boolean;
      matchItemId: number | null;
      confidence: number;
      reasoning: string;
      perCandidate: Array<{ sku: string; sameDress: boolean; confidence: number; notes: string }>;
      error?: string;
    };
  };
};

function toResultItem(r: RankedCandidate, boost = 0): DressCheckerResultItem {
  const score = Math.min(100, r.identity.final + boost);
  const emb = r.identity.embeddingComponents;
  return {
    id: r.itemId,
    name: r.name,
    display_name: dressDisplayName(r.name, r.category, r.size),
    sku: r.sku,
    category: r.category,
    status: r.status,
    size: r.size,
    color: r.color || "",
    photo: recognitionPhotoRef({ recognitionImage: r.recognitionImage, photo: r.photo }) || r.photo || "",
    daily_rate: r.dailyRate,
    sub_category: r.subCategory || "",
    inventory_location: r.subCategory || "Main Rack",
    similarity: score,
    confidence: mapConfidence(score),
    rank_reason: r.rankReason,
    match_explanation: {
      embroidery: r.explanation.embroidery,
      border: r.explanation.border,
      texture: r.explanation.texture,
      silhouette: r.explanation.silhouette,
      motifs: r.explanation.motifs,
      colour: r.explanation.colour,
      overall: score,
      summary: r.explanation.summary,
    },
    component_scores: {
      global: r.identity.deepEmbedding,
      border: r.identity.border,
      blouse: emb.blouse,
      skirt: r.identity.silhouette,
      embroidery: r.identity.embroidery,
      texture: r.identity.texture,
      motifs: r.identity.motifs,
      silhouette: r.identity.silhouette,
      color: r.identity.colour,
      metadataColor: emb.metadataColor,
      weighted: score,
    },
    best_reference: r.best_reference,
  };
}

function buildRejectedList(pool: RankedCandidate[], selected: RankedCandidate[]): RejectedCandidate[] {
  const selectedIds = new Set(selected.map((s) => s.itemId));
  return pool
    .filter((c) => !selectedIds.has(c.itemId))
    .slice(0, 8)
    .map((c) => ({
      sku: c.sku,
      name: c.name,
      score: c.identity.final,
      reason:
        c.identity.keypoints < 35 && c.identity.embroidery < 55
          ? "Geometric ornament alignment failed"
          : c.identity.embroidery < 50 && c.identity.border < 50
            ? "Low embroidery and border identity"
            : c.identity.final < 70
              ? "Below confidence threshold"
              : "Outranked by stronger identity match",
    }));
}

/**
 * Dress Checker Engine v6 — identity matching via region embeddings + geometry.
 */
export async function searchDressesByPhoto(
  photoBuffer: Buffer,
  filters: CatalogFilters = {},
  options: DressCheckerSearchOptions = {},
): Promise<DressCheckerSearchResult> {
  const searchStart = Date.now();
  const embedStart = Date.now();

  const query = await analyzeQueryImage(photoBuffer, undefined, {
    category: filters.category || options.category,
  });

  const embeddingDurationMs = Date.now() - embedStart;
  const uploadDims = await imageDimensions(query.garment.buffer);

  const { candidates: pool, staleCount } = await loadCatalogCandidates(filters);
  if (!pool.length) {
    throw new Error("No identification indexes built yet. Run Admin → Rebuild AI Profiles.");
  }

  const { candidates: retrieved, stages: filterStages } = retrieveCandidates(query, pool);
  const reranked = rerankCandidates(query, retrieved);

  // Precision stage — OpenAI Vision decides SAME physical dress among local shortlist.
  const vlm: VlmVerificationOutcome = await applyVlmVerification(photoBuffer, reranked);
  const rankedForSelection = vlm.reranked;

  const finalRanked = selectFinalResults(rankedForSelection);
  const category = filters.category || query.category;
  const items = finalRanked.map((r) => toResultItem(r));

  let category_results = items;
  let other_results: DressCheckerResultItem[] = [];
  let used_fallback = false;
  if (category) {
    const inCat = items.filter((i) => i.category === category);
    if (inCat.length) {
      category_results = inCat;
    } else {
      used_fallback = true;
      category_results = [];
      other_results = items;
    }
  }

  const decision = resolveSearchDecision(finalRanked, undefined, vlm.usedVlm);
  const searchDurationMs = Date.now() - searchStart;

  logDressChecker({
    timestamp: new Date().toISOString(),
    event: "search",
    searchDurationMs,
    embeddingDurationMs,
    imageWidth: uploadDims.width,
    imageHeight: uploadDims.height,
    imageBytes: uploadDims.bytes,
    modelId: SIGLIP_MODEL_ID,
    embeddingVersion: IDENTIFICATION_INDEX_VERSION,
    preprocessingVersion: PREPROCESSING_VERSION,
    embeddingDimension: SIGLIP_EMBEDDING_DIM,
    topPredictionSku: finalRanked[0]?.sku,
    topConfidence: finalRanked[0]?.identity.final,
    secondPredictionSku: finalRanked[1]?.sku,
    secondConfidence: finalRanked[1]?.identity.final,
    decision: decision.decision,
    requiresManualConfirmation: decision.requires_manual_confirmation,
    warning: staleCount > 0 ? `${staleCount} stale AI profiles` : undefined,
    identityEngine: vlm.usedVlm ? "vlm+embedding" : "embedding_only",
  });

  const result: DressCheckerSearchResult = {
    ok: true,
    category,
    category_results,
    other_results,
    used_fallback,
    results: [...category_results, ...other_results],
    search_engine: "identification",
    best_similarity: finalRanked[0]?.identity.final || 0,
    reliable_identification: decision.decision === "identified",
    identification_meta: decision,
    image_warnings: query.validation.warnings,
  };

  if (options.debug) {
    const fp = query.fingerprint;
    result.dress_checker_debug = {
      uploadedImage: {
        width: uploadDims.width,
        height: uploadDims.height,
        bytes: uploadDims.bytes,
      },
      embeddingModel: SIGLIP_MODEL_ID,
      embeddingDimension: SIGLIP_EMBEDDING_DIM,
      embeddingVersion: IDENTIFICATION_INDEX_VERSION,
      preprocessingVersion: PREPROCESSING_VERSION,
      preprocessingPipeline: `dress_checker_v${DRESS_CHECKER_ENGINE_VERSION}`,
      embeddingGenerationMs: embeddingDurationMs,
      searchMs: searchDurationMs,
      memoryUsageMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
      inventoryImagesUsed: pool.length,
      staleIndexCount: staleCount,
      referenceImageSelected: finalRanked[0]?.best_reference.label || "multi_view",
      inventoryImageUsed: `${finalRanked[0]?.viewCount ?? 0} views`,
      pipelineStages: query.stageLog.map((s) => ({
        stage: s.stage,
        durationMs: s.durationMs,
        detail: s.detail,
      })),
      candidateFilterStages: filterStages,
      queryFingerprint: query.fingerprint as unknown as Record<string, unknown>,
      engineVersion: DRESS_CHECKER_ENGINE_VERSION,
      queryViewCount: query.viewCount,
      detectedGarment: {
        category: fp.category,
        partialView: query.partialView ?? "full",
        embroideryStyle: fp.embroideryStyle,
        embroideryDensity: fp.embroideryDensity,
        sleeveLength: fp.sleeveLength,
        necklineShape: fp.necklineShape,
        silhouette: fp.silhouette,
        stoneWork: fp.stoneWork,
        mirrorWork: fp.mirrorWork,
      },
      rejectedCandidates: buildRejectedList(reranked, finalRanked),
      vlm: vlm.verdict
        ? {
            used: vlm.usedVlm,
            matchItemId: vlm.verdict.matchItemId,
            confidence: vlm.verdict.confidence,
            reasoning: vlm.verdict.reasoning,
            perCandidate: vlm.verdict.perCandidate.map((p) => ({
              sku: p.sku,
              sameDress: p.sameDress,
              confidence: p.confidence,
              notes: p.notes,
            })),
            error: vlm.verdict.error,
          }
        : { used: false, matchItemId: null, confidence: 0, reasoning: "VLM not used", perCandidate: [] },
      topMatches: reranked.slice(0, 10).map((r, i) => ({
        rank: i + 1,
        sku: r.sku,
        name: r.name,
        photo: recognitionPhotoRef({ recognitionImage: r.recognitionImage, photo: r.photo }) || "",
        finalScore: r.identity.final,
        globalScore: r.identity.deepEmbedding,
        borderScore: r.identity.border,
        embroideryScore: r.identity.embroidery,
        textureScore: r.identity.texture,
        colorScore: r.identity.colour,
        bestRefId: r.best_reference.refId,
        bestRefLabel: r.best_reference.label,
        bestQuerySource: r.best_reference.querySource,
        rankReason: r.rankReason,
      })),
      componentScores: finalRanked[0]
        ? {
            global: finalRanked[0].identity.deepEmbedding,
            border: finalRanked[0].identity.border,
            blouse: finalRanked[0].identity.embeddingComponents.blouse,
            skirt: finalRanked[0].identity.embeddingComponents.skirt,
            embroidery: finalRanked[0].identity.embroidery,
            texture: finalRanked[0].identity.texture,
            color: finalRanked[0].identity.colour,
            metadataColor: finalRanked[0].identity.embeddingComponents.metadataColor,
            weighted: finalRanked[0].identity.final,
          }
        : null,
    };
  }

  return result;
}

export { DRESS_CHECKER_ENGINE_VERSION };
