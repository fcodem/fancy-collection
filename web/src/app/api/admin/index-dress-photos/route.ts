import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  enqueueBulkAiRebuild,
  getAiJobQueueStats,
} from "@/lib/dressChecker/aiJobClient";
import { countUnindexedInventoryWithPhotos } from "@/lib/dressChecker/aiIndexingSelfHeal";
import { RECOGNITION_PIPELINE_VERSION } from "@/lib/recognitionPipeline/types";

export const dynamic = "force-dynamic";
/** Enqueue only — never await SigLIP drain on this request. */
export const maxDuration = 60;

function kickWorkerDrain() {
  try {
    after(() => {
      void import("@/lib/dressChecker/aiJobWorker")
        .then(({ drainAiJobQueue, resolveAiCronDrainLimit }) =>
          drainAiJobQueue(resolveAiCronDrainLimit(5), { source: "index_dress_photos" }),
        )
        .catch((err) => console.error("[index-dress-photos] after-drain failed:", err));
    });
  } catch (afterErr) {
    // Never await drain on the request path — that hangs the browser and shows "Failed".
    console.warn("[index-dress-photos] after() unavailable; cron will drain:", afterErr);
    void import("@/lib/dressChecker/aiJobWorker")
      .then(({ drainAiJobQueue }) => drainAiJobQueue(1, { source: "index_dress_photos_fallback" }))
      .catch(() => {});
  }
}

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const [total, unindexed, queue] = await Promise.all([
    prisma.clothingItem.count({
      where: { photo: { not: null }, NOT: { photo: "" } },
    }),
    countUnindexedInventoryWithPhotos(),
    getAiJobQueueStats().catch(() => null),
  ]);

  const pending = unindexed;
  const indexed = Math.max(0, total - pending);

  return jsonOk({
    total,
    indexed,
    pending,
    queuePending: queue?.pending ?? 0,
    queueProcessing: queue?.processing ?? 0,
    queueFailed: queue?.failed ?? 0,
    engine: "recognition_pipeline_v2",
    pipelineVersion: RECOGNITION_PIPELINE_VERSION,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const force = body.force === true;

  // Lightweight enqueue only — never import/await processInventory on this route.
  const result = await enqueueBulkAiRebuild(force);
  kickWorkerDrain();

  const queuedNow = result.newlyQueued + result.alreadyQueued;
  let message = "No pending photos to index.";
  if (queuedNow > 0) {
    if (result.newlyQueued === 0 && result.alreadyQueued > 0) {
      message = `${result.alreadyQueued} photo(s) are already in the AI queue. The worker is processing them — this page updates as they finish.`;
    } else if (result.alreadyQueued > 0) {
      message = `Queued ${result.newlyQueued} new job(s); ${result.alreadyQueued} were already waiting. Worker is running — watch the count climb.`;
    } else {
      message = `Queued ${result.newlyQueued} dress photo(s) for AI indexing. The worker is processing them now — this page will update as they finish.`;
    }
  }

  return jsonOk({
    processed: result.processed,
    failed: result.failed,
    queued: queuedNow,
    newlyQueued: result.newlyQueued,
    alreadyQueued: result.alreadyQueued,
    message,
    engine: "recognition_pipeline_v2",
  });
}
