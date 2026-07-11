import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { enqueueRepairJobs } from "@/lib/dressChecker/aiJobQueue";
import { drainAiJobQueue } from "@/lib/dressChecker/aiJobWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Nightly: enqueue repair jobs for FAILED/STALE/incomplete profiles, then drain a batch. */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const enqueued = await enqueueRepairJobs(200);
    const drained = await drainAiJobQueue(10, { source: "repair" });
    return jsonOk({ ok: true, enqueued, ...drained });
  } catch (e) {
    Sentry.captureException(e);
    console.error("dress-checker-repair cron failed:", e);
    return jsonError(e instanceof Error ? e.message : "Cron job failed", 500);
  }
}
