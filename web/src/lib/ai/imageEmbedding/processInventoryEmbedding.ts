import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { upsertInventoryEmbeddingVector, isPgvectorAvailable } from "@/lib/ai/pgvector";
import { loadPhotoBuffer } from "@/lib/services/siglipSearch";
import {
  computeImageFingerprint,
  serializeDesignFingerprint,
} from "@/lib/photoHash";
import { generateInventoryImageEmbedding, type EmbeddingAttempt } from "./imageEmbeddingService";
import type { FailedEmbeddingMetadata, StoredEmbeddingMetadata } from "./constants";

export type PersistEmbeddingInput = {
  itemId: number;
  embedding: number[];
  modelId: string;
  tier: string;
  latencyMs: number;
  reason: string;
  imageBuffer: Buffer;
  attempts?: EmbeddingAttempt[];
};

function mergeVerificationMetadata(
  existing: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

export async function persistInventoryEmbeddingResult(
  input: PersistEmbeddingInput,
): Promise<void> {
  const fingerprint = await computeImageFingerprint(input.imageBuffer);
  const serialized = serializeDesignFingerprint(fingerprint);
  const now = new Date();
  const pgOk = await isPgvectorAvailable();

  const existing = await prisma.inventoryAiProfile.findUnique({
    where: { itemId: input.itemId },
    select: { verificationMetadata: true, status: true, aiStatus: true },
  });

  const embeddingMeta: StoredEmbeddingMetadata = {
    model: input.modelId,
    tier: input.tier as StoredEmbeddingMetadata["tier"],
    dimension: input.embedding.length,
    latencyMs: input.latencyMs,
    completedAt: now.toISOString(),
    reason: input.reason,
    ...(input.attempts?.length ? { attempts: input.attempts } : {}),
  };

  // Embedding-only writes must NEVER promote a profile to READY.
  // READY is reserved for validated enterprise identity indexing.
  await prisma.inventoryAiProfile.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      aiStatus: "PROCESSING",
      status: "processing",
      needsReindex: true,
      photoHash: serialized.averageHash,
      differenceHash: serialized.differenceHash,
      colorHistogram: fingerprint.colorHistogram,
      modelVersion: input.modelId,
      reindexedAt: now,
      processingError: null,
      hasEmbedding: true,
      verificationMetadata: { embedding: embeddingMeta },
      ...(pgOk ? {} : { imageEmbeddingJson: input.embedding }),
    },
    update: {
      photoHash: serialized.averageHash,
      differenceHash: serialized.differenceHash,
      colorHistogram: fingerprint.colorHistogram,
      modelVersion: input.modelId,
      reindexedAt: now,
      processingError: null,
      error: null,
      hasEmbedding: true,
      verificationMetadata: mergeVerificationMetadata(existing?.verificationMetadata, {
        embedding: embeddingMeta,
      }),
      ...(pgOk ? {} : { imageEmbeddingJson: input.embedding }),
    },
  });

  if (pgOk) {
    await upsertInventoryEmbeddingVector(input.itemId, input.embedding);
  }
}

export async function markInventoryEmbeddingFailed(
  itemId: number,
  error: string,
  latencyMs: number,
  reason: string,
  attempts?: EmbeddingAttempt[],
): Promise<void> {
  const existing = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    select: { verificationMetadata: true, status: true, aiStatus: true },
  });

  const failedMeta: FailedEmbeddingMetadata = {
    error,
    latencyMs,
    failedAt: new Date().toISOString(),
    reason,
    ...(attempts?.length ? { attempts } : {}),
  };

  const keepReady = existing?.aiStatus === "READY" || existing?.status === "ready";

  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: {
      itemId,
      aiStatus: "FAILED",
      status: "failed",
      needsReindex: true,
      processingError: error,
      indexFailureReason: error,
      verificationMetadata: { embedding: failedMeta },
    },
    update: {
      processingError: error,
      ...(keepReady
        ? {}
        : {
            aiStatus: "FAILED",
            status: "failed",
            needsReindex: true,
            indexFailureReason: error,
          }),
      verificationMetadata: mergeVerificationMetadata(existing?.verificationMetadata, {
        embedding: failedMeta,
      }),
    },
  });
}

/** Generate embedding + hashes and persist to inventory_ai_profiles.embedding_vector. */
export async function processInventoryEmbedding(
  itemId: number,
  reason = "scheduled",
): Promise<boolean> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { photo: true },
  });
  if (!item?.photo) return false;

  const buffer = await loadPhotoBuffer(item.photo);
  if (!buffer) return false;

  console.log(`EMBEDDING START item=${itemId} reason=${reason}`);
  const started = Date.now();

  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "processing" },
    update: { status: "processing" },
  });

  try {
    const result = await generateInventoryImageEmbedding(buffer);
    const latencyMs = Date.now() - started;
    await persistInventoryEmbeddingResult({
      itemId,
      embedding: result.vector,
      modelId: result.modelId,
      tier: result.tier,
      latencyMs,
      reason,
      imageBuffer: buffer,
    });
    console.log(
      `EMBEDDING COMPLETE item=${itemId} model=${result.modelId} tier=${result.tier} ms=${latencyMs}`,
    );
    return true;
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : "Embedding generation failed";
    const attempts = (err as Error & { attempts?: EmbeddingAttempt[] }).attempts;
    await markInventoryEmbeddingFailed(itemId, msg, latencyMs, reason, attempts);
    console.error(`EMBEDDING FAILED item=${itemId} ms=${latencyMs}`, msg);
    return false;
  }
}

const pending = new Set<number>();

/** Queue embedding generation — runs whenever an inventory photo is saved. */
export function scheduleInventoryEmbedding(itemId: number, reason = "photo_changed"): void {
  if (!itemId || pending.has(itemId)) return;
  pending.add(itemId);
  setImmediate(() => {
    void (async () => {
      try {
        await processInventoryEmbedding(itemId, reason);
      } catch (err) {
        console.error("[inventory-embedding]", itemId, err);
      } finally {
        pending.delete(itemId);
      }
    })();
  });
}

/** Retry failed embeddings (admin / scripts). */
export async function retryFailedInventoryEmbeddings(
  itemIds?: number[],
): Promise<{ processed: number; failed: number }> {
  const targets =
    itemIds?.length
      ? itemIds
      : (
          await prisma.inventoryAiProfile.findMany({
            where: {
              OR: [
                { processingError: { not: null } },
                { status: { in: ["failed", "error"] } },
              ],
            },
            select: { itemId: true },
          })
        ).map((p) => p.itemId);

  let processed = 0;
  let failed = 0;
  for (const id of targets) {
    const ok = await processInventoryEmbedding(id, "embedding_retry");
    if (ok) processed++;
    else failed++;
  }
  return { processed, failed };
}
