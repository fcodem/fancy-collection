import type {
  ComponentScores,
  IdentificationIndex,
  QueryReferenceFingerprint,
} from "../dressIdentificationTypes";
import type { PartialViewType } from "./partialViewDetection";
import { verifyGeometricAlignment } from "./geometricVerification";
import {
  globalEmbeddingScore,
  matchRegionEmbeddings,
} from "./regionEmbeddingMatch";
import {
  CONFIDENCE_THRESHOLDS,
  FINGERPRINT_MATCH_WEIGHTS,
} from "./constants";
import { dominantColorFamiliesMismatch } from "../inventoryColourSemantics";
import {
  BRIDAL_OVERRIDE_THRESHOLDS,
  computeEnterpriseMatchScore,
} from "./enterpriseMatchScore";
import {
  isViewpointVariationMatch,
  matchLocalKeypoints,
} from "./viewInvariantMatching";
import {
  buildBridalIdentityHashes,
  matchBridalIdentityHashes,
} from "./bridalIdentityHashes";
import type { FeatureFingerprint, IdentityScores } from "./types";

export type IdentitySearchInput = {
  queryViews: QueryReferenceFingerprint[];
  queryFingerprint: FeatureFingerprint;
  inventoryIndex: IdentificationIndex;
  inventoryFingerprint: FeatureFingerprint | null;
  partialView: PartialViewType;
  queryType?: import("./queryTypeDetection").DressQueryType;
};

export type IdentitySearchResult = {
  identity: IdentityScores;
  stage1Global: number;
  stage2Regional: number;
  stage3Geometric: number;
  rejected: boolean;
  rejectReason?: string;
  viewpointVariation?: boolean;
  bridalOverride?: boolean;
};

function buildComponentScores(region: ReturnType<typeof matchRegionEmbeddings>): ComponentScores {
  return {
    global: region.global,
    border: region.border,
    blouse: region.blouse,
    skirt: region.skirt,
    embroidery: region.embroidery,
    texture: region.texture,
    color: region.colour,
    metadataColor: region.colour,
    weighted: region.regional,
  };
}

/**
 * Cross-view bridal identity search.
 * bestReferenceScore = max(all reference scores) — hanger/mannequin/folded/customer/detail.
 * Bridal hashes run before GPT (caller). Embeddings never dominate.
 */
export function searchGarmentIdentity(input: IdentitySearchInput): IdentitySearchResult {
  const { queryViews, queryFingerprint: q, inventoryIndex, inventoryFingerprint: stored, partialView, queryType } =
    input;
  const refs = inventoryIndex.references;

  const stage1Global = globalEmbeddingScore(queryViews, refs);
  const region = matchRegionEmbeddings(queryViews, refs, q, stored, partialView);
  const stage2Regional = region.regional;

  let stage3Geometric = 0;
  let keypointMatch = { border: 0, motif: 0, panel: 0, combined: 0 };
  let bridalHashScore = 0;
  let rejected = false;
  let rejectReason: string | undefined;

  if (stored) {
    keypointMatch = matchLocalKeypoints(q, stored);
    const geo = verifyGeometricAlignment(q, stored);
    const qHashes = buildBridalIdentityHashes(q);
    const sHashes = buildBridalIdentityHashes(stored);
    const hashMatch = matchBridalIdentityHashes(qHashes, sHashes);
    bridalHashScore = hashMatch.combined;

    // Geometry + keypoints + bridal hashes (PART 6 before GPT)
    stage3Geometric = Math.round(
      geo.score * 0.35 + keypointMatch.combined * 0.35 + bridalHashScore * 0.3,
    );

    const panelScore = region.silhouette;
    const viewpointEarly = isViewpointVariationMatch({
      embedding: region.global,
      border: Math.max(region.border, keypointMatch.border),
      motif: Math.max(region.motifs, keypointMatch.motif),
      panel: Math.max(panelScore, keypointMatch.panel),
    });

    // Soften geometry reject for cross-view; bridal hash mismatch can still reject near-dups later
    if (!geo.passed && stage2Regional < 65 && !viewpointEarly && bridalHashScore < 45) {
      rejected = true;
      rejectReason = geo.rejectReason;
    }
  } else {
    stage3Geometric = Math.round((region.embroidery + region.border) / 2);
  }

  const categoryMismatch = !!(stored && q.category !== stored.category);
  const dominantColorMismatch = stored
    ? dominantColorFamiliesMismatch(q.colourFamily, stored.colourFamily)
    : false;

  const stoneScore =
    stored && (q.stoneWork || stored.stoneWork)
      ? Math.round(
          (q.embroideryDensity + stored.embroideryDensity) / 2 +
            (region.embroidery + region.border) / 4,
        )
      : undefined;

  const panel = Math.max(region.silhouette, keypointMatch.panel);
  const border = Math.max(region.border, Math.round(keypointMatch.border * 0.85 + region.border * 0.15));
  const motif = Math.max(region.motifs, Math.round(keypointMatch.motif * 0.85 + region.motifs * 0.15));

  // Use MAX embedding across regions for the embedding component (not pose-sensitive global alone)
  const embeddingComponent = Math.max(region.global, stage1Global);

  const enterprise = computeEnterpriseMatchScore({
    embedding: embeddingComponent,
    embroidery: region.embroidery,
    border,
    colour: region.colour,
    motif,
    panel,
    stone: stoneScore,
    silhouette: panel,
    categoryMismatch,
    dominantColorMismatch,
    queryType,
  });

  let final = Math.round(enterprise.score * 0.97 + stage3Geometric * 0.03);
  const viewpointVariation = !!enterprise.viewpointVariation;
  const bridalOverride = !!enterprise.bridalOverride;

  if (enterprise.rejected) {
    rejected = true;
    rejectReason = rejectReason || enterprise.rejectReason;
    final = Math.min(final, CONFIDENCE_THRESHOLDS.possible - 1);
  } else if (bridalOverride) {
    rejected = false;
    rejectReason = undefined;
    final = Math.max(final, BRIDAL_OVERRIDE_THRESHOLDS.minimumFinalScore);
  } else if (viewpointVariation) {
    rejected = false;
    rejectReason = undefined;
    final = Math.max(final, CONFIDENCE_THRESHOLDS.possible);
  }

  // Bridal override requires strong hash agreement — blocks near-duplicate false accepts
  if (
    !rejected &&
    bridalHashScore > 0 &&
    bridalHashScore < 50
  ) {
    // Weak bridal hash → do not allow override floor / exact band
    if (bridalOverride) {
      final = Math.min(final, 84);
    }
    if (final >= 90) {
      final = Math.min(final, 84);
    }
  }

  if (rejected) {
    final = Math.min(final, CONFIDENCE_THRESHOLDS.possible - 1);
  }

  const identity: IdentityScores = {
    embroidery: region.embroidery,
    border,
    texture: region.texture,
    silhouette: panel,
    motifs: motif,
    deepEmbedding: embeddingComponent,
    neckline: region.neckline,
    sleeve: region.sleeve,
    colour: region.colour,
    keypoints: stage3Geometric,
    dupatta: region.dupatta,
    final,
    weights: FINGERPRINT_MATCH_WEIGHTS,
    bestRefId: region.bestRefId,
    bestRefLabel: region.bestRefLabel,
    bestQuerySource: region.bestQuerySource,
    embeddingComponents: buildComponentScores(region),
  };

  return {
    identity,
    stage1Global,
    stage2Regional,
    stage3Geometric,
    rejected,
    rejectReason,
    viewpointVariation: viewpointVariation || undefined,
    bridalOverride: bridalOverride || undefined,
  };
}

/** Stage 1 pre-filter — max across all reference embeddings. */
export function stage1GlobalScore(
  queryViews: QueryReferenceFingerprint[],
  references: import("../dressIdentificationTypes").StoredReferenceFingerprint[],
): number {
  return globalEmbeddingScore(queryViews, references);
}
