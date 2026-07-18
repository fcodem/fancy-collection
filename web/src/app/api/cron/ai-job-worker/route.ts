import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { drainAiJobQueue } from "@/lib/dressChecker/aiJobWorker";
import { recoverStuckAiJobs } from "@/lib/dressChecker/deploymentSafety";
import { resumeFailedAiJobs } from "@/lib/dressChecker/aiJobQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Serverless-safe: recover stuck/failed jobs, drain a small batch, exit.
 * Never starts setInterval.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  const started = Date.now();
  try {
    const stuck = await recoverStuckAiJobs().catch(() => ({ recovered: 0, itemIds: [] as number[] }));
    const resumed = await resumeFailedAiJobs().catch(() => 0);
    // One heavy job per serverless invocation until tmp/native stability is proven.
    const result = await drainAiJobQueue(1, { source: "cron" });
    const totalMs = Date.now() - started;
    if (totalMs > 2_000) {
      console.log(
        `[perf] route=/api/cron/ai-job-worker totalMs=${totalMs} recovered=${stuck.recovered} resumed=${resumed} processed=${result.processed}`,
      );
    }
    return jsonOk({
      ok: true,
      recovered: stuck.recovered,
      resumed,
      ...result,
      totalMs,
    });
  } catch (e) {
    Sentry.captureException(e);
    return jsonError(e instanceof Error ? e.message : "Worker cron failed", 500);
  }
}
