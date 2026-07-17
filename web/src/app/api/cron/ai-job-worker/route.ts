import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { drainAiJobQueue } from "@/lib/dressChecker/aiJobWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Serverless-safe: drain one small batch and exit. Never starts setInterval.
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  const started = Date.now();
  try {
    const result = await drainAiJobQueue(1, { source: "cron" });
    const totalMs = Date.now() - started;
    if (totalMs > 2_000) {
      console.log(`[perf] route=/api/cron/ai-job-worker totalMs=${totalMs} processed=${result.processed}`);
    }
    return jsonOk({
      ok: true,
      ...result,
      totalMs,
    });
  } catch (e) {
    Sentry.captureException(e);
    return jsonError(e instanceof Error ? e.message : "Worker cron failed", 500);
  }
}
