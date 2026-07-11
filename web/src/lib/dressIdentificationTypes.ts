import type { FabricColorFamily } from "./photoHash";

export const IDENTIFICATION_INDEX_VERSION = 4;

/** Weighted components for inventory identification (not generic similarity). */
export const IDENTIFICATION_WEIGHTS = {
  global: 0.5,
  border: 0.2,
  embroidery: 0.15,
  texture: 0.1,
  color: 0.05,
} as const;

export const IDENTIFICATION_RELIABLE_THRESHOLD = 90;

/**
 * Cross-view region embeddings per image.
 * Aliases: fullEmbedding=global, panelEmbedding=skirt, motifEmbedding=motif,
 * dupattEmbedding=dupatta, silhouetteEmbedding=silhouette.
 */
export type RegionEmbeddings = {
  /** fullEmbedding */
  global: number[];
  /** borderEmbedding */
  border: number[];
  /** blouseEmbedding */
  blouse: number[];
  /** panelEmbedding (skirt / panel structure) */
  skirt: number[];
  embroidery: number[];
  /** motifEmbedding — optional on older indexes */
  motif?: number[];
  /** dupattEmbedding — optional; never dominate identity */
  dupatta?: number[];
  /** silhouetteEmbedding — optional */
  silhouette?: number[];
};

/** Explicit cross-view embedding bag (storage / diagnostics naming). */
export type CrossViewEmbeddingBag = {
  fullEmbedding: number[];
  borderEmbedding: number[];
  motifEmbedding: number[];
  blouseEmbedding: number[];
  panelEmbedding: number[];
  dupattEmbedding: number[];
  silhouetteEmbedding: number[];
};

export function toCrossViewEmbeddingBag(e: RegionEmbeddings): CrossViewEmbeddingBag {
  return {
    fullEmbedding: e.global,
    borderEmbedding: e.border,
    motifEmbedding: e.motif ?? e.embroidery,
    blouseEmbedding: e.blouse,
    panelEmbedding: e.skirt,
    dupattEmbedding: e.dupatta ?? [],
    silhouetteEmbedding: e.silhouette ?? e.global,
  };
}

export type TextureFingerprint = {
  averageHash: string;
  differenceHash: string;
  centreHash: string;
  bottomHash: string;
  topHash: string;
};

export type StoredReferenceFingerprint = {
  refId: string;
  label: string;
  embeddings: RegionEmbeddings;
  texture: TextureFingerprint;
  colorHistogram: number[];
  colorFamily: FabricColorFamily;
};

export type IdentificationIndex = {
  version: typeof IDENTIFICATION_INDEX_VERSION;
  modelId: string;
  preprocessingVersion: number;
  embeddingDimension: number;
  contentHash: string;
  indexedAt: string;
  category: string;
  references: StoredReferenceFingerprint[];
};

export type ComponentScores = {
  global: number;
  border: number;
  blouse: number;
  skirt: number;
  embroidery: number;
  texture: number;
  color: number;
  metadataColor: number;
  weighted: number;
};

export type MatchDebugInfo = {
  refId: string;
  refLabel: string;
  querySource: string;
  components: ComponentScores;
};

export type IdentificationMatch = {
  itemId: number;
  sku: string;
  name: string;
  category: string;
  finalScore: number;
  components: ComponentScores;
  bestRefId: string;
  bestRefLabel: string;
  bestQuerySource: string;
  rankReason: string;
  debug?: MatchDebugInfo[];
};

export type QueryReferenceFingerprint = {
  source: string;
  embeddings: RegionEmbeddings;
  texture: TextureFingerprint;
  colorHistogram: number[];
  colorFamily: FabricColorFamily;
};

export type CategoryDetectionResult = {
  category: string;
  confidence: number;
  scores: Record<string, number>;
};
