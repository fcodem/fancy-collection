import type { FabricColorFamily } from "../photoHash";
import type { RegionEmbeddings } from "../dressIdentificationTypes";

export const RECOGNITION_PIPELINE_VERSION = 2;

export type CategoryGroup = "womens" | "mens" | "jewellery" | "other";

export type GarmentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RecognitionFeatureFingerprint = {
  version: typeof RECOGNITION_PIPELINE_VERSION;
  primaryColour: string;
  secondaryColour: string;
  accentColours: string[];
  colourHistogram: number[];
  colourFamily: FabricColorFamily;
  fabricTextureDescriptor: number[];
  embroideryDensity: number;
  embroideryStyle: string;
  stoneWork: boolean;
  mirrorWork: boolean;
  threadPattern: number[];
  borderPattern: { averageHash: string; differenceHash: string; widthRatio: number };
  sleeveLength: string;
  necklineShape: string;
  silhouette: string;
  garmentShape: string;
  dupattaPattern: string | null;
  dupattaBorder: string | null;
  motifDistribution: number[];
  textureFeatures: number[];
  orbKeypoints: number[];
  localDescriptors: number[];
  garmentBounds: GarmentBounds;
  categoryGroup: CategoryGroup;
  category: string;
  subCategory: string;
  qualityScore: number;
  processedAt: string;
};

export type PipelineStageLog = {
  stage: string;
  durationMs: number;
  detail?: string;
};

export type ProcessedGarmentImage = {
  buffer: Buffer;
  bounds: GarmentBounds;
  originalWidth: number;
  originalHeight: number;
  backgroundSuppressed: boolean;
};

export type QueryPipelineResult = {
  validation: { ok: boolean; warnings: string[] };
  garment: ProcessedGarmentImage;
  fingerprint: RecognitionFeatureFingerprint;
  embeddings: RegionEmbeddings;
  categoryGroup: CategoryGroup;
  category: string;
  subCategory: string;
  stageLog: PipelineStageLog[];
};

export type HybridComponentScores = {
  visual: number;
  colour: number;
  embroidery: number;
  border: number;
  silhouette: number;
  sleeve: number;
  neckline: number;
  hybrid: number;
  rejected?: string[];
};

export type CandidateFilterStage = {
  stage: number;
  name: string;
  before: number;
  after: number;
};

export type ConfidenceBand = "reliable" | "very_likely" | "possible" | "unreliable";

export type StoredRecognitionProfile = {
  itemId: number;
  sku: string;
  name: string;
  category: string;
  subCategory: string | null;
  color: string | null;
  fingerprint: RecognitionFeatureFingerprint | null;
  embeddings: RegionEmbeddings | null;
  identificationIndex: unknown;
};
