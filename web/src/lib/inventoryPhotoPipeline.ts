import prisma from "./prisma";
import { broadcastShopEvent } from "./realtime/broadcast";
import { photoUrl } from "./photoUrl";
import type { PipelineStage, PipelineStatus } from "./inventoryPhotoPipelineTypes";
export type { PipelineStage, PipelineStatus } from "./inventoryPhotoPipelineTypes";

const pipelinePending = new Set<number>();

export function computePipelineStatus(item: {
  photo: string | null;
  recognitionImage: string | null;
  identificationIndexedAt: Date | null;
}): PipelineStatus {
  const photo_url = item.photo ? photoUrl(item.photo) : "";
  const hasPhoto = !!item.photo;
  const recognitionDone = !!item.recognitionImage;
  const embeddingsDone = !!item.identificationIndexedAt;

  const stages = {
    upload: hasPhoto ? ("completed" as const) : ("pending" as const),
    recognition: recognitionDone
      ? ("completed" as const)
      : hasPhoto
        ? ("processing" as const)
        : ("pending" as const),
    embeddings: embeddingsDone
      ? ("completed" as const)
      : recognitionDone
        ? ("processing" as const)
        : ("pending" as const),
  };

  let stage: PipelineStage = "none";
  let label = "";

  if (recognitionDone && embeddingsDone) {
    stage = "completed";
    label = "Search indexing complete";
  } else if (recognitionDone && !embeddingsDone) {
    stage = "generating_embeddings";
    label = "Generating embeddings…";
  } else if (hasPhoto && !recognitionDone) {
    stage = "generating_recognition";
    label = "Generating recognition image…";
  } else if (hasPhoto) {
    stage = "queued";
    label = "Queued for search indexing";
  }

  const is_processing =
    stage !== "completed" && stage !== "none" && hasPhoto;

  return {
    stage,
    label,
    is_processing,
    photo_url,
    display_photo_url: photo_url,
    error: null,
    stages,
  };
}

/**
 * Run recognition / metadata / search indexing asynchronously.
 * Never call from the save request path.
 *
 * Embedding (FashionCLIP → SigLIP → OpenCLIP) runs on every photo save.
 * Full Dress Checker identity pipeline runs in parallel.
 */
export async function runInventoryPhotoPipeline(
  itemId: number,
  _category: string,
  reason: string,
): Promise<void> {
  // Instant enqueue — worker performs embeddings + signatures + validation.
  const { scheduleInventoryAiProfile } = await import("./dressChecker/processInventory");
  scheduleInventoryAiProfile(itemId, reason);
  broadcastShopEvent({ type: "inventory.changed", itemIds: [itemId] });
}

/** Queue search indexing — returns immediately. */
export function scheduleInventoryPhotoPipeline(
  itemId: number,
  category: string,
  reason = "photo_changed",
): void {
  if (!itemId || pipelinePending.has(itemId)) return;
  pipelinePending.add(itemId);

  setImmediate(() => {
    void (async () => {
      try {
        console.log(`[inventory-pipeline] item=${itemId} scheduled reason=${reason}`);
        await runInventoryPhotoPipeline(itemId, category, reason);
      } catch (err) {
        console.error("[inventory-pipeline]", itemId, err);
      } finally {
        pipelinePending.delete(itemId);
      }
    })();
  });
}
