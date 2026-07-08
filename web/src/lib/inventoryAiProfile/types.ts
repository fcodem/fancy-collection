/** Model-agnostic embedding slot — supports SigLIP, CLIP, future ViT models. */
export type EmbeddingSlot = {
  model: string;
  modelVersion: string;
  dimension: number;
  vector: number[];
  region?: string;
};

export type ProfileEmbeddings = {
  global?: EmbeddingSlot;
  colour?: EmbeddingSlot;
  texture?: EmbeddingSlot;
  embroidery?: EmbeddingSlot;
  border?: EmbeddingSlot;
  sleeve?: EmbeddingSlot;
  neckline?: EmbeddingSlot;
  dupatta?: EmbeddingSlot;
  jewellery?: EmbeddingSlot;
  shape?: EmbeddingSlot;
  fineDetail?: EmbeddingSlot;
  blouse?: EmbeddingSlot;
  skirt?: EmbeddingSlot;
};

export type ColourAnalysis = {
  primary: string;
  secondary: string;
  accents: string[];
  palette: Array<{ name: string; hex: string; percentage: number }>;
  dominantPercentage: number;
  contrastLevel: "low" | "medium" | "high";
  brightness: number;
  colourTemperature: "warm" | "neutral" | "cool";
};

export type GarmentAttributes = {
  category?: string;
  subcategory?: string;
  gender?: string;
  occasion?: string;
  style?: string;
  silhouette?: string;
  sleeveType?: string;
  neckType?: string;
  length?: string;
  fabricType?: string;
  embroideryType?: string;
  stoneWork?: boolean;
  mirrorWork?: boolean;
  sequinWork?: boolean;
  borderStyle?: string;
  dupattaStyle?: string;
  blouseStyle?: string;
  pattern?: string;
  print?: string;
  texture?: string;
  fitStyle?: string;
};

export type JewelleryAttributes = {
  jewelleryCategory?: string;
  materialAppearance?: string;
  stoneColour?: string;
  necklaceType?: string;
  earringType?: string;
  maangTikka?: boolean;
  bangles?: boolean;
  ring?: boolean;
  completeSet?: boolean;
  traditionalStyle?: boolean;
  modernStyle?: boolean;
};

export type QualityScores = {
  sharpness: number;
  lighting: number;
  backgroundQuality: number;
  noise: number;
  perspective: number;
  colourAccuracy: number;
  garmentVisibility: number;
  embroideryVisibility: number;
  overallCatalogueQuality: number;
  overallRecognitionQuality: number;
};

export type DuplicateFingerprint = {
  version: number;
  visualEmbeddingRef: string;
  colourHistogram: number[];
  textureFeatures: number[];
  localKeypoints: number[];
  fineDetailEmbedding?: number[];
  shapeSignature: string;
  averageHash: string;
  differenceHash: string;
};

export type SourceImages = {
  original?: string | null;
  recognition?: string | null;
};

export type HealthIssue = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
};

export type VisionMetadata = {
  description: string;
  tags: string[];
  garmentAttributes: GarmentAttributes;
  jewelleryAttributes: JewelleryAttributes;
  colourHints?: Partial<ColourAnalysis>;
};

export type CustomerSafeProfile = {
  itemId: number;
  status: string;
  description: string | null;
  tags: string[];
  colourAnalysis: ColourAnalysis | null;
  garmentAttributes: GarmentAttributes | null;
  jewelleryAttributes: JewelleryAttributes | null;
  qualityScores: QualityScores | null;
  healthScore: number | null;
  healthIssues: HealthIssue[];
  indexedAt: string | null;
  hasManualOverrides: boolean;
};

export type InternalProfile = CustomerSafeProfile & {
  currentVersion: number;
  pipelineVersion: string;
  duplicateFingerprint: DuplicateFingerprint | null;
  searchText: string | null;
  embeddings?: ProfileEmbeddings;
  featureFingerprint?: Record<string, unknown>;
  versions: Array<{ version: number; createdAt: string; visionModel: string | null }>;
  processingHistory: Array<{
    event: string;
    message: string | null;
    version: number | null;
    createdAt: string;
  }>;
  override: Record<string, unknown> | null;
  aiGenerated: {
    description: string | null;
    tags: string[];
    colourAnalysis: ColourAnalysis | null;
    garmentAttributes: GarmentAttributes | null;
    jewelleryAttributes: JewelleryAttributes | null;
  };
};
