import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { runAiSystemHealthAudit } from "@/lib/dressChecker/aiSystemHealth";
import {
  enqueueInventoryAiJob,
  enqueueRepairJobs,
  resumeFailedAiJobs,
} from "@/lib/dressChecker/aiJobQueue";
import { drainAiJobQueue, startAiJobWorker } from "@/lib/dressChecker/aiJobWorker";
import { rebuildSelectedAiProfiles } from "@/lib/dressChecker/processInventory";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function loadNonReadyRows(): Promise<Array<Record<string, unknown>>> {
  // Raw SQL avoids stale Prisma client missing aiStatus / needsReindex fields.
  let profiles: Array<{
    item_id: number;
    sku: string;
    name: string;
    photo: string | null;
    ai_status: string;
    pipeline_version: string | null;
    recognition_version: number | null;
    matching_version: number | null;
    last_indexed_at: Date | null;
    last_successful_index_at: Date | null;
    error: string | null;
    index_failure_reason: string | null;
    auto_repair_count: number | null;
    needs_reindex: boolean | null;
  }>;

  try {
    profiles = await prisma.$queryRawUnsafe(
      `SELECT
         p.item_id,
         c.sku,
         c.name,
         c.photo,
         COALESCE(NULLIF(p.ai_status, ''), UPPER(p.status), 'PENDING') AS ai_status,
         p.pipeline_version,
         p.recognition_version,
         p.matching_version,
         p.last_indexed_at,
         p.last_successful_index_at,
         p.error,
         p.index_failure_reason,
         COALESCE(p.auto_repair_count, 0) AS auto_repair_count,
         COALESCE(p.needs_reindex, false) AS needs_reindex
       FROM inventory_ai_profiles p
       JOIN clothing_items c ON c.id = p.item_id
       WHERE COALESCE(NULLIF(p.ai_status, ''), UPPER(p.status), 'PENDING') <> 'READY'
          OR COALESCE(p.needs_reindex, false) = true
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT 100`,
    );
  } catch {
    profiles = await prisma.$queryRawUnsafe(
      `SELECT
         p.item_id,
         c.sku,
         c.name,
         c.photo,
         UPPER(COALESCE(p.status, 'pending')) AS ai_status,
         p.pipeline_version,
         p.recognition_version,
         NULL::int AS matching_version,
         p.last_indexed_at,
         NULL::timestamptz AS last_successful_index_at,
         p.error,
         NULL::text AS index_failure_reason,
         0 AS auto_repair_count,
         false AS needs_reindex
       FROM inventory_ai_profiles p
       JOIN clothing_items c ON c.id = p.item_id
       WHERE LOWER(COALESCE(p.status, '')) <> 'ready'
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT 100`,
    );
  }

  const itemIds = profiles.map((p) => Number(p.item_id));
  let jobByItem = new Map<number, { status: string; retryCount: number }>();
  if (itemIds.length) {
    try {
      const jobs = await prisma.$queryRawUnsafe<
        Array<{ item_id: number; status: string; retry_count: number }>
      >(
        `SELECT DISTINCT ON (item_id) item_id, status, COALESCE(retry_count, 0) AS retry_count
         FROM inventory_ai_jobs
         WHERE item_id = ANY($1::int[])
         ORDER BY item_id, id DESC`,
        itemIds,
      );
      jobByItem = new Map(
        jobs.map((j) => [
          Number(j.item_id),
          { status: j.status, retryCount: Number(j.retry_count || 0) },
        ]),
      );
    } catch {
      // jobs table may be missing on older DBs
    }
  }

  return profiles.map((p) => {
    const job = jobByItem.get(Number(p.item_id));
    return {
      itemId: Number(p.item_id),
      sku: p.sku,
      name: p.name,
      photo: p.photo,
      aiStatus: String(p.ai_status || "PENDING").toUpperCase(),
      pipelineVersion: p.pipeline_version,
      recognitionVersion: p.recognition_version,
      matchingVersion: p.matching_version,
      lastIndexedAt: p.last_successful_index_at || p.last_indexed_at,
      error: p.index_failure_reason || p.error,
      retryCount: job?.retryCount ?? Number(p.auto_repair_count || 0),
      jobStatus: job?.status ?? null,
      needsReindex: !!p.needs_reindex,
    };
  });
}

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const url = new URL(req.url);
    const includeRows = url.searchParams.get("rows") !== "0";

    const health = await runAiSystemHealthAudit();
    const rows = includeRows ? await loadNonReadyRows() : [];
    const { buildQueueForensicReport } = await import("@/lib/dressChecker/queueForensic");
    const forensic = await buildQueueForensicReport().catch(() => null);

    return jsonOk({ health, rows, forensic });
  } catch (e) {
    console.error("[ai-indexing-dashboard] GET failed:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to load AI indexing status", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as {
    action?:
      | "reindex_selected"
      | "reindex_failed"
      | "repair_all"
      | "resume_queue"
      | "drain_queue"
      | "self_heal"
      | "resume_dead_letter"
      | "retry_one"
      | "ignore_dead_letter"
      | "remove_dead_letter"
      | "recover_expired_leases"
      | "retry_safe_failed"
      | "move_to_dead_letter"
      | "trigger_worker_run";
    itemIds?: number[];
    jobId?: number;
  };

  // Pure management actions must not spin up the worker or drain jobs.
  const managementOnly = new Set([
    "ignore_dead_letter",
    "remove_dead_letter",
    "move_to_dead_letter",
  ]);

  try {
    // Resume via durable drain — no in-process interval on Vercel.
    if (!managementOnly.has(body.action ?? "")) {
      if (process.env.VERCEL !== "1") {
        startAiJobWorker();
      } else if (
        body.action !== "recover_expired_leases" &&
        body.action !== "retry_safe_failed"
      ) {
        const { drainAiJobQueue } = await import("@/lib/dressChecker/aiJobWorker");
        await drainAiJobQueue(3, { source: "admin" });
      }
    }

    if (body.action === "recover_expired_leases") {
      const { recoverExpiredProcessingLeases } = await import("@/lib/dressChecker/aiJobQueue");
      const recovered = await recoverExpiredProcessingLeases();
      return jsonOk({
        ...recovered,
        message: `Recovered ${recovered.recovered} expired processing lease(s)`,
      });
    }

    if (body.action === "retry_safe_failed") {
      const { retrySafeFailedAiJobs } = await import("@/lib/dressChecker/aiJobQueue");
      const resumed = await retrySafeFailedAiJobs(50);
      const drained = await drainAiJobQueue(Math.min(resumed, 5), { source: "admin" });
      return jsonOk({
        resumed,
        ...drained,
        message: `Retried ${resumed} safe failed job(s); drained ${drained.processed}`,
      });
    }

    if (body.action === "move_to_dead_letter") {
      const jobId = Number(body.jobId);
      if (!Number.isFinite(jobId)) return jsonError("jobId required", 400);
      const { moveDeterministicFailureToDeadLetter } = await import(
        "@/lib/dressChecker/aiJobQueue"
      );
      const ok = await moveDeterministicFailureToDeadLetter(jobId);
      if (!ok) return jsonError("Job not found or not eligible", 404);
      return jsonOk({ message: `Moved job ${jobId} to dead letter` });
    }

    if (body.action === "trigger_worker_run") {
      const { recoverStuckAiJobs } = await import("@/lib/dressChecker/deploymentSafety");
      const stuck = await recoverStuckAiJobs().catch(() => ({ recovered: 0 }));
      const drained = await drainAiJobQueue(1, { source: "admin_trigger" });
      return jsonOk({
        recovered: stuck.recovered,
        ...drained,
        message: `Triggered one worker run (recovered ${stuck.recovered}, processed ${drained.processed})`,
      });
    }

    if (body.action === "retry_one") {
      const jobId = Number(body.jobId);
      if (!Number.isFinite(jobId)) return jsonError("jobId required", 400);
      const { retryOneAiJob } = await import("@/lib/dressChecker/aiJobQueue");
      const ok = await retryOneAiJob(jobId);
      if (!ok) return jsonError("Job not found or not retryable", 404);
      const drained = await drainAiJobQueue(1, { source: "admin" });
      return jsonOk({ ...drained, message: `Retried job ${jobId}` });
    }

    if (body.action === "ignore_dead_letter") {
      const jobId = Number(body.jobId);
      if (!Number.isFinite(jobId)) return jsonError("jobId required", 400);
      const { ignoreDeadLetterAiJob } = await import("@/lib/dressChecker/aiJobQueue");
      const ok = await ignoreDeadLetterAiJob(jobId);
      if (!ok) return jsonError("Dead-letter job not found", 404);
      return jsonOk({ message: `Ignored dead-letter job ${jobId}` });
    }

    if (body.action === "remove_dead_letter") {
      const jobId = Number(body.jobId);
      if (!Number.isFinite(jobId)) return jsonError("jobId required", 400);
      const { removeDeadLetterAiJob } = await import("@/lib/dressChecker/aiJobQueue");
      const ok = await removeDeadLetterAiJob(jobId);
      if (!ok) return jsonError("Dead-letter job not found", 404);
      return jsonOk({ message: `Removed dead-letter job ${jobId}` });
    }

    if (body.action === "reindex_selected") {
      const ids = (body.itemIds || []).filter((n) => Number.isFinite(n));
      if (!ids.length) return jsonError("itemIds required", 400);
      const result = await rebuildSelectedAiProfiles(ids);
      return jsonOk({ ...result, message: `Queued ${result.processed} reindex jobs` });
    }

    if (body.action === "reindex_failed") {
      const failed = await prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
        `SELECT item_id FROM inventory_ai_profiles
         WHERE COALESCE(NULLIF(ai_status, ''), UPPER(status), 'PENDING')
               IN ('FAILED', 'STALE', 'RETRYING')
         LIMIT 200`,
      );
      for (const row of failed) {
        await enqueueInventoryAiJob({
          itemId: Number(row.item_id),
          reason: "admin_reindex_failed",
          priority: 40,
          staleExisting: true,
        });
      }
      const resumed = await resumeFailedAiJobs();
      return jsonOk({
        queued: failed.length,
        resumedJobs: resumed,
        message: `Queued ${failed.length} failed/stale profiles; resumed ${resumed} jobs`,
      });
    }

    if (body.action === "repair_all") {
      const enqueued = await enqueueRepairJobs(500);
      return jsonOk({ enqueued, message: `Enqueued ${enqueued} repair jobs` });
    }

    if (body.action === "resume_queue") {
      const resumed = await resumeFailedAiJobs();
      const drained = await drainAiJobQueue(10, { source: "admin" });
      return jsonOk({
        resumed,
        ...drained,
        message: `Resumed ${resumed} failed jobs; drained ${drained.processed}`,
      });
    }

    if (body.action === "resume_dead_letter") {
      const { resumeDeadLetterAiJobs } = await import("@/lib/dressChecker/aiJobQueue");
      const resumed = await resumeDeadLetterAiJobs();
      const drained = await drainAiJobQueue(10, { source: "admin" });
      return jsonOk({
        resumed,
        ...drained,
        message: `Resumed ${resumed} dead-letter jobs; drained ${drained.processed}`,
      });
    }

    if (body.action === "self_heal") {
      const { runAiQueueSelfHeal } = await import("@/lib/dressChecker/queueSelfHeal");
      const report = await runAiQueueSelfHeal({
        source: "admin",
        drainLimit: 15,
        resumeDeadLetters: true,
      });
      return jsonOk({
        ...report,
        message: `Self-heal complete: drained ${report.drained}, repair ${report.repairEnqueued}, worker ${report.worker.mode}`,
      });
    }

    if (body.action === "drain_queue") {
      const drained = await drainAiJobQueue(10, { source: "admin" });
      return jsonOk({ ...drained, message: `Processed ${drained.processed} jobs` });
    }

    return jsonError("Unknown action", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    console.error("[ai-indexing-dashboard]", e);
    return jsonError(message, 500);
  }
}
