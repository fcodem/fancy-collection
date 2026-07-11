import type { FabricColorFamily } from "../photoHash";
import type {
  ComponentScores,
  IdentificationIndex,
  QueryReferenceFingerprint,
  RegionEmbeddings,
  StoredReferenceFingerprint,
} from "../dressIdentificationTypes";
import type { FINGERPRINT_MATCH_WEIGHTS } from "./constants";

export const DRESS_CHECKER_FINGERPRINT_VERSION = 9;

export type CategoryGroup = "womens" | "mens" | "jewellery" | "other";

export type GarmentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FeatureFingerprint = {
  version: typeof DRESS_CHECKER_FINGERPRINT_VERSION;
  primaryColour: string;
  secondaryColour: string;
  accentColours: string[];
  colourHistogram: number[];
  colourFamily: FabricColorFamily;
  /** LAB dress-mask colour diagnostics */
  colourDiagnostics?: import("./dressColourLab").DressColourDiagnostics;
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

export type ProcessedGarment = {
  buffer: Buffer;
  bounds: GarmentBounds;
  originalWidth: number;
  originalHeight: number;
  backgroundSuppressed: boolean;
};

export type StageLog = {
  stage: string;
  durationMs: number;
  detail?: string;
};

/** v4 identity match breakdown — embroidery-first scoring. */
export type IdentityScores = {
  embroidery: number;
  border: number;
  texture: number;
  silhouette: number;
  motifs: number;
  deepEmbedding: number;
  neckline: number;
  sleeve: number;
  colour: number;
  keypoints: number;
  dupatta: number;
  final: number;
  weights: typeof FINGERPRINT_MATCH_WEIGHTS;
  bestRefId: string;
  bestRefLabel: string;
  bestQuerySource: string;
  embeddingComponents: ComponentScores;
};

/** Backward-compatible alias used by confidence + UI layers. */
export type HybridScores = {
  visual: number;
  colour: number;
  embroidery: number;
  border: number;
  texture: number;
  silhouette: number;
  sleeve: number;
  neckline: number;
  final: number;
  weights: typeof FINGERPRINT_MATCH_WEIGHTS;
  identity?: IdentityScores;
};

export type MatchExplanation = {
  embroidery: number;
  border: number;
  texture: number;
  silhouette: number;
  motifs: number;
  colour: number;
  neckline: number;
  sleeve: number;
  overall: number;
  summary: string;
  bestView: string;
  bestInventoryView: string;
};

export type FilterStage = {
  stage: number;
  name: string;
  before: number;
  after: number;
};

export type CatalogCandidate = {
  itemId: number;
  sku: string;
  name: string;
  category: string;
  subCategory: string | null;
  color: string | null;
  status: string;
  size: string;
  photo: string | null;
  recognitionImage: string | null;
  dailyRate: number;
  fingerprint: FeatureFingerprint | null;
  identificationIndex: IdentificationIndex;
  references: StoredReferenceFingerprint[];
  embeddings: RegionEmbeddings | null;
  embeddingScore: number;
  viewCount: number;
};

export type RankedCandidate = CatalogCandidate & {
  hybrid: HybridScores;
  identity: IdentityScores;
  rankReason: string;
  explanation: MatchExplanation;
  best_reference: { refId: string; label: string; querySource: string };
};

export type QueryAnalysis = {
  validation: { ok: boolean; warnings: string[] };
  garment: ProcessedGarment;
  fingerprint: FeatureFingerprint;
  /** Multi-view query fingerprints (rotation + crop variants). */
  queryFingerprints: QueryReferenceFingerprint[];
  embeddings: RegionEmbeddings;
  categoryGroup: CategoryGroup;
  category: string;
  subCategory: string;
  stageLog: StageLog[];
  viewCount: number;
  /** Detected partial region (skirt/blouse/dupatta/full). */
  partialView?: import("./partialViewDetection").PartialViewType;
  /** Enterprise cross-view query presentation type */
  queryType?: import("./queryTypeDetection").DressQueryType;
};

export type RejectedCandidate = {
  sku: string;
  name: string;
  score: number;
  reason: string;
};
