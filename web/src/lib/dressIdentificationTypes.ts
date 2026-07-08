import type { FabricColorFamily } from "./photoHash";

export const IDENTIFICATION_INDEX_VERSION = 3;

/** Weighted components for inventory identification (not generic similarity). */
export const IDENTIFICATION_WEIGHTS = {
  global: 0.5,
  border: 0.2,
  embroidery: 0.15,
  texture: 0.1,
  color: 0.05,
} as const;

export const IDENTIFICATION_RELIABLE_THRESHOLD = 90;

export type RegionEmbeddings = {
  global: number[];
  border: number[];
  blouse: number[];
  skirt: number[];
  embroidery: number[];
};

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
