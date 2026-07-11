import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { drainAiJobQueue, startAiJobWorker } from "@/lib/dressChecker/aiJobWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Keep the durable AI job queue moving (serverless-safe drain). */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    startAiJobWorker();
    const result = await drainAiJobQueue(5, { source: "cron" });
    return jsonOk({ ok: true, ...result });
  } catch (e) {
    Sentry.captureException(e);
    return jsonError(e instanceof Error ? e.message : "Worker cron failed", 500);
  }
}
