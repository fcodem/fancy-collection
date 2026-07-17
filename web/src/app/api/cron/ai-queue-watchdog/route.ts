import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { runQueueWatchdog } from "@/lib/dressChecker/deploymentSafety";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Watchdog: recover stuck jobs + drain a small batch. No in-process interval. */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const result = await runQueueWatchdog();
    const { touchDurableWorkerHeartbeat } = await import("@/lib/dressChecker/workerHeartbeat");
    await touchDurableWorkerHeartbeat({
      source: "watchdog",
      processedDelta: result.drained,
      error: result.warning || null,
    });
    return jsonOk({ ok: true, ...result });
  } catch (e) {
    Sentry.captureException(e);
    return jsonError(e instanceof Error ? e.message : "Watchdog failed", 500);
  }
}
