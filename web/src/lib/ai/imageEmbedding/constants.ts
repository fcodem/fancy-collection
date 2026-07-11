/** Target dimension for inventory_ai_profiles.embedding_vector (SigLIP / pgvector). */
export const INVENTORY_EMBEDDING_DIM = 768;

export type EmbeddingModelTier = "fashionclip" | "siglip" | "openclip";

export const DEFAULT_EMBEDDING_MODEL_ORDER: EmbeddingModelTier[] = [
  "fashionclip",
  "siglip",
  "openclip",
];

export type EmbeddingModelConfig = {
  tier: EmbeddingModelTier;
  modelId: string;
  expectedDim: number | null;
};

export const EMBEDDING_MODELS: Record<EmbeddingModelTier, EmbeddingModelConfig> = {
  fashionclip: {
    tier: "fashionclip",
    modelId: "ff13/fashion-clip",
    expectedDim: 512,
  },
  siglip: {
    tier: "siglip",
    modelId: "Xenova/siglip-base-patch16-224",
    expectedDim: 768,
  },
  openclip: {
    tier: "openclip",
    modelId: "Xenova/clip-vit-base-patch16",
    expectedDim: 512,
  },
};

export function parseEmbeddingModelOrder(): EmbeddingModelTier[] {
  const raw = process.env.IMAGE_EMBEDDING_MODELS?.trim();
  if (!raw) return DEFAULT_EMBEDDING_MODEL_ORDER;
  const tiers = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((t): t is EmbeddingModelTier =>
      t === "fashionclip" || t === "siglip" || t === "openclip",
    );
  return tiers.length ? tiers : DEFAULT_EMBEDDING_MODEL_ORDER;
}

export type ImageEmbeddingResult = {
  vector: number[];
  modelId: string;
  tier: EmbeddingModelTier;
  dimension: number;
  latencyMs: number;
};

export type StoredEmbeddingMetadata = {
  model: string;
  tier: EmbeddingModelTier;
  dimension: number;
  latencyMs: number;
  completedAt: string;
  reason?: string;
  attempts?: Array<{ tier: EmbeddingModelTier; modelId: string; error: string }>;
};

export type FailedEmbeddingMetadata = {
  error: string;
  latencyMs: number;
  failedAt: string;
  reason?: string;
  attempts?: Array<{ tier: EmbeddingModelTier; modelId: string; error: string }>;
};
