import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { processBlobCleanupJobs } from "@/lib/blobCleanup";
import { processPendingPrivateMediaCleanup } from "@/lib/bookingPrivateMediaCleanup";
import { cleanupAbandonedMutationStaging } from "@/lib/mutationReceipt";

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
    const abandoned = await cleanupAbandonedMutationStaging(25).catch((e) => {
      console.error("[cron/blob-cleanup] abandoned staging:", e instanceof Error ? e.message : e);
      return { cleaned: 0, paths: 0 };
    });
    const summary = await processBlobCleanupJobs(25);
    const privateMedia = await processPendingPrivateMediaCleanup(25);
    return jsonOk({ ok: true, abandoned_staging: abandoned, ...summary, private_media: privateMedia });
  } catch (e) {
    console.error("[cron/blob-cleanup]", e instanceof Error ? e.message : e);
    return jsonError("Blob cleanup failed", 500);
  }
}
