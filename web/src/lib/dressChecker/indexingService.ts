/**
 * Dress Checker indexing — perceptual hashes + vision embeddings (no OpenAI).
 * Embeddings use FashionCLIP → SigLIP → OpenCLIP cascade (768-d for pgvector).
 */
import type { ImageFingerprint } from "@/lib/photoHash";
import {
  computeImageFingerprint,
  serializeDesignFingerprint,
} from "@/lib/photoHash";
import { generateInventoryImageEmbedding } from "@/lib/ai/imageEmbedding/imageEmbeddingService";
import type { EmbeddingAttempt } from "@/lib/ai/imageEmbedding/imageEmbeddingService";
import {
  persistInventoryEmbeddingResult,
  markInventoryEmbeddingFailed,
} from "@/lib/ai/imageEmbedding/processInventoryEmbedding";

export type IndexHashPayload = {
  photoHash: string;
  differenceHash: string;
  colorHistogram: number[];
  fingerprint: ImageFingerprint;
};

export async function generateIndexHashes(imageBuffer: Buffer): Promise<IndexHashPayload> {
  console.log("[dress-checker] START HASHING");
  const fingerprint = await computeImageFingerprint(imageBuffer);
  const serialized = serializeDesignFingerprint(fingerprint);
  return {
    photoHash: serialized.averageHash,
    differenceHash: serialized.differenceHash,
    colorHistogram: fingerprint.colorHistogram,
    fingerprint,
  };
}

/** Generate query/catalog embedding via model cascade (768-d). */
export async function generateIndexEmbedding(
  imageBuffer: Buffer,
  itemId?: number,
): Promise<number[]> {
  const label = itemId != null ? ` item=${itemId}` : "";
  console.log(`EMBEDDING START${label}`);
  const started = Date.now();
  const result = await generateInventoryImageEmbedding(imageBuffer);
  const latencyMs = Date.now() - started;
  console.log(
    `EMBEDDING COMPLETE${label} model=${result.modelId} tier=${result.tier} ms=${latencyMs}`,
  );
  return result.vector;
}

export async function indexImageBuffers(
  itemId: number,
  imageBuffer: Buffer,
  reason = "index_image_buffers",
): Promise<{ hashes: IndexHashPayload; embedding: number[] }> {
  const hashes = await generateIndexHashes(imageBuffer);
  console.log(`EMBEDDING START item=${itemId}`);
  const started = Date.now();
  try {
    const result = await generateInventoryImageEmbedding(imageBuffer);
    const latencyMs = Date.now() - started;
    console.log(
      `EMBEDDING COMPLETE item=${itemId} model=${result.modelId} tier=${result.tier} ms=${latencyMs}`,
    );
    await persistInventoryEmbeddingResult({
      itemId,
      embedding: result.vector,
      modelId: result.modelId,
      tier: result.tier,
      latencyMs,
      reason,
      imageBuffer,
    });
    return { hashes, embedding: result.vector };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : "Embedding failed";
    const attempts = (err as Error & { attempts?: EmbeddingAttempt[] }).attempts;
    await markInventoryEmbeddingFailed(itemId, msg, latencyMs, reason, attempts);
    console.error(`EMBEDDING FAILED item=${itemId} ms=${latencyMs}`, msg);
    throw err;
  }
}
