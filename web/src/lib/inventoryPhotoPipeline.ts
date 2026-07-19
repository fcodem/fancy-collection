import prisma from "./prisma";
import { broadcastShopEvent } from "./realtime/broadcast";
import { photoUrl } from "./photoUrl";
import type { PipelineStage, PipelineStatus } from "./inventoryPhotoPipelineTypes";
import { enqueueInventoryAiJob } from "./dressChecker/aiJobClient";
export type { PipelineStage, PipelineStatus } from "./inventoryPhotoPipelineTypes";

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

  const is_processing = stage !== "completed" && stage !== "none" && hasPhoto;

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
 * Lightweight durable enqueue only — never runs embeddings / OpenAI / Dress Checker.
 * Call from inventory save after items are committed. Awaits DB writes.
 */
export async function enqueueInventoryPhotoJobsDurable(
  itemIds: number[],
  reason = "photo_changed",
  enqueueFn: typeof enqueueInventoryAiJob = enqueueInventoryAiJob,
): Promise<{ queued: number; jobIds: number[]; warning: string | null }> {
  const unique = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return { queued: 0, jobIds: [], warning: null };

  const staleExisting =
    reason.includes("photo") || reason.includes("replaced") || reason.includes("created");
  const priority = reason.includes("repair") ? 50 : 100;
  const jobIds: number[] = [];
  const errors: string[] = [];

  const CONCURRENCY = 5;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((itemId) =>
        enqueueFn({
          itemId,
          reason,
          staleExisting,
          priority,
        }),
      ),
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        jobIds.push(r.value.jobId);
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push(`item ${chunk[idx]}: ${msg}`);
        console.error("[inventory-pipeline] durable enqueue failed", chunk[idx], r.reason);
      }
    });
  }

  if (jobIds.length) {
    try {
      broadcastShopEvent({ type: "inventory.changed", itemIds: unique });
    } catch {
      /* realtime notify is best-effort */
    }
  }

  return {
    queued: jobIds.length,
    jobIds,
    warning: errors.length
      ? `AI queue incomplete for ${errors.length} item(s). Use AI indexing to retry.`
      : null,
  };
}

/**
 * @deprecated Prefer enqueueInventoryPhotoJobsDurable + after(drain).
 * Kept as a thin async wrapper for call sites mid-migration.
 */
export async function scheduleInventoryPhotoPipeline(
  itemId: number,
  _category: string,
  reason = "photo_changed",
): Promise<{ queued: number; warning: string | null }> {
  const result = await enqueueInventoryPhotoJobsDurable([itemId], reason);
  return { queued: result.queued, warning: result.warning };
}
