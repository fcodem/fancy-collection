import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { processBlobCleanupJobs } from "@/lib/blobCleanup";

export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return jsonError("Unauthorized", 401);
  try {
    const summary = await processBlobCleanupJobs(25);
    return jsonOk({ ok: true, ...summary });
  } catch (e) {
    console.error("[cron/blob-cleanup]", e instanceof Error ? e.message : e);
    return jsonError("Blob cleanup failed", 500);
  }
}
