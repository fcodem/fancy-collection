import {
  EMBEDDING_MODELS,
  INVENTORY_EMBEDDING_DIM,
  parseEmbeddingModelOrder,
  type EmbeddingModelTier,
  type ImageEmbeddingResult,
} from "./constants";
import { embedWithClipVisionModel, embedWithSiglipVisionModel } from "./backends";

export type EmbeddingAttempt = {
  tier: EmbeddingModelTier;
  modelId: string;
  error: string;
};

async function embedWithTier(
  buffer: Buffer,
  tier: EmbeddingModelTier,
): Promise<number[]> {
  const config = EMBEDDING_MODELS[tier];
  if (tier === "siglip") {
    return embedWithSiglipVisionModel(buffer, config.modelId);
  }
  return embedWithClipVisionModel(buffer, config.modelId, tier);
}

/**
 * Generate a normalized inventory image embedding using the configured model cascade.
 * Order: FashionCLIP → SigLIP → OpenCLIP (no OpenAI embeddings).
 * Only vectors matching INVENTORY_EMBEDDING_DIM (768) are accepted for pgvector storage.
 */
export async function generateInventoryImageEmbedding(
  buffer: Buffer,
): Promise<ImageEmbeddingResult> {
  const order = parseEmbeddingModelOrder();
  const started = Date.now();
  const attempts: EmbeddingAttempt[] = [];

  for (const tier of order) {
    const config = EMBEDDING_MODELS[tier];
    try {
      const vector = await embedWithTier(buffer, tier);
      if (vector.length !== INVENTORY_EMBEDDING_DIM) {
        const msg = `${config.modelId} produced ${vector.length}-d vector; need ${INVENTORY_EMBEDDING_DIM}-d for pgvector`;
        attempts.push({ tier, modelId: config.modelId, error: msg });
        console.warn(`[embedding] skip ${tier}: ${msg}`);
        continue;
      }
      return {
        vector,
        modelId: config.modelId,
        tier,
        dimension: vector.length,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ tier, modelId: config.modelId, error: msg });
      console.warn(`[embedding] ${tier} failed (${config.modelId}): ${msg}`);
    }
  }

  const detail = attempts.map((a) => `${a.tier}: ${a.error}`).join("; ");
  const error = new Error(
    `All embedding models failed or returned incompatible dimensions. ${detail}`,
  ) as Error & { attempts?: EmbeddingAttempt[] };
  error.attempts = attempts;
  throw error;
}
