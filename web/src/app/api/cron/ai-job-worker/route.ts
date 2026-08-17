import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import {
  drainAiJobQueue,
  resolveAiCronDrainLimit,
} from "@/lib/dressChecker/aiJobWorker";
import { recoverStuckAiJobs } from "@/lib/dressChecker/deploymentSafety";
import {
  resumeFailedAiJobs,
  resumeDeadLetterAiJobs,
  enqueueRepairJobs,
  getAiJobQueueStats,
} from "@/lib/dressChecker/aiJobQueue";

export const dynamic = "force-dynamic";
/** Allow enough time for SigLIP + multi-view fingerprint on Vercel Pro. */
export const maxDuration = 300;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Serverless-safe: recover stuck/failed jobs, enqueue missing indexes, drain a batch, exit.
 * Never starts setInterval.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  const started = Date.now();
  try {
    const stuck = await recoverStuckAiJobs().catch(() => ({
      recovered: 0,
      itemIds: [] as number[],
    }));
    const resumed = await resumeFailedAiJobs().catch(() => 0);
    const deadLetterResumed = await resumeDeadLetterAiJobs().catch(() => 0);
    const stats = await getAiJobQueueStats().catch(() => ({ pending: 0, processing: 0, retrying: 0 }));
    const openQueue = (stats.pending || 0) + (stats.processing || 0) + (stats.retrying || 0);
    const repairEnqueued =
      openQueue > 80 ? 0 : await enqueueRepairJobs(40).catch(() => 0);
    const drainLimit = resolveAiCronDrainLimit(3);
    const result = await drainAiJobQueue(drainLimit, { source: "cron" });
    const totalMs = Date.now() - started;
    if (totalMs > 2_000) {
      console.log(
        `[perf] route=/api/cron/ai-job-worker totalMs=${totalMs} recovered=${stuck.recovered} resumed=${resumed} repair=${repairEnqueued} processed=${result.processed} drainLimit=${drainLimit}`,
      );
    }
    return jsonOk({
      ok: true,
      recovered: stuck.recovered,
      resumed,
      deadLetterResumed,
      repairEnqueued,
      drainLimit,
      ...result,
      totalMs,
    });
  } catch (e) {
    Sentry.captureException(e);
    return jsonError(e instanceof Error ? e.message : "Worker cron failed", 500);
  }
}
