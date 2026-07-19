/**
 * Lightweight AI queue client — enqueue, stats, admin controls.
 * Safe for inventory routes, health probes, and dashboard code.
 * No imports of aiJobWorker, processInventory, transformers, or onnxruntime.
 */
import { hostname } from "os";
import prisma from "@/lib/prisma";
import {
  AI_STATUS,
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
  legacyStatusFromAi,
} from "./profileReadiness";
import { ensurePendingAiProfile, markProfileStale } from "./profileLifecycle";
import { IDENTIFICATION_INDEX_VERSION } from "@/lib/dressIdentificationTypes";
import {
  AI_JOB_STATUS,
  DEFAULT_MAX_RETRIES,
  DETERMINISTIC_FAILURE_RE,
  type EnqueueAiJobInput,
  nextRetryAt,
} from "./aiJobTypes";

export {
  AI_JOB_STATUS,
  DEFAULT_MAX_RETRIES,
  DETERMINISTIC_FAILURE_RE,
  nextRetryAt,
  type AiJobStatus,
  type EnqueueAiJobInput,
} from "./aiJobTypes";

const WORKER_ID = `${hostname()}:${process.pid}`;

/**
 * Create a durable indexing job and return immediately.
 * Dedupes open jobs for the same item.
 */
export async function enqueueInventoryAiJob(input: EnqueueAiJobInput): Promise<{
  jobId: number;
  created: boolean;
}> {
  const itemId = input.itemId;
  if (!itemId) throw new Error("itemId required");

  await ensurePendingAiProfile(itemId);

  if (input.staleExisting) {
    await markProfileStale(itemId, `Reindex required: ${input.reason || "photo_changed"}`);
  } else {
    await prisma.inventoryAiProfile.updateMany({
      where: { itemId },
      data: {
        aiStatus: AI_STATUS.PENDING,
        status: legacyStatusFromAi(AI_STATUS.PENDING),
        needsReindex: true,
      },
    });
  }

  const open = await prisma.inventoryAiJob.findFirst({
    where: {
      itemId,
      status: { in: [AI_JOB_STATUS.PENDING, AI_JOB_STATUS.PROCESSING, AI_JOB_STATUS.RETRYING] },
    },
    orderBy: { id: "desc" },
  });

  if (open) {
    await prisma.inventoryAiJob.update({
      where: { id: open.id },
      data: {
        reason: input.reason || open.reason,
        priority: Math.min(open.priority, input.priority ?? open.priority),
        ...(input.staleExisting && open.status === AI_JOB_STATUS.RETRYING
          ? { status: AI_JOB_STATUS.PENDING, nextRetryAt: null }
          : {}),
      },
    });
    return { jobId: open.id, created: false };
  }

  const job = await prisma.inventoryAiJob.create({
    data: {
      itemId,
      status: AI_JOB_STATUS.PENDING,
      reason: input.reason || "enqueue",
      priority: input.priority ?? 100,
      maxRetries: DEFAULT_MAX_RETRIES,
    },
  });

  return { jobId: job.id, created: true };
}

export async function resumeFailedAiJobs(): Promise<number> {
  const result = await prisma.inventoryAiJob.updateMany({
    where: { status: AI_JOB_STATUS.FAILED },
    data: {
      status: AI_JOB_STATUS.PENDING,
      retryCount: 0,
      nextRetryAt: null,
      errorMessage: null,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
    },
  });
  return result.count;
}

/** Re-queue dead-letter jobs with a fresh retry budget. */
export async function resumeDeadLetterAiJobs(): Promise<number> {
  const result = await prisma.inventoryAiJob.updateMany({
    where: { status: AI_JOB_STATUS.DEAD_LETTER },
    data: {
      status: AI_JOB_STATUS.PENDING,
      retryCount: 0,
      nextRetryAt: null,
      errorMessage: null,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
      reason: "dead_letter_resume",
      priority: 30,
    },
  });
  return result.count;
}

/** Owner control: retry a single FAILED / DEAD_LETTER job with a fresh budget. */
export async function retryOneAiJob(jobId: number): Promise<boolean> {
  const result = await prisma.inventoryAiJob.updateMany({
    where: {
      id: jobId,
      status: { in: [AI_JOB_STATUS.FAILED, AI_JOB_STATUS.DEAD_LETTER] },
    },
    data: {
      status: AI_JOB_STATUS.PENDING,
      retryCount: 0,
      nextRetryAt: null,
      errorMessage: null,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
      reason: "manual_retry_one",
      priority: 25,
    },
  });
  return result.count > 0;
}

/** Owner control: ignore a dead-letter job (kept for audit, never re-run). */
export async function ignoreDeadLetterAiJob(jobId: number): Promise<boolean> {
  const result = await prisma.inventoryAiJob.updateMany({
    where: { id: jobId, status: AI_JOB_STATUS.DEAD_LETTER },
    data: { status: AI_JOB_STATUS.CANCELLED, lockedAt: null, lockedBy: null },
  });
  return result.count > 0;
}

/** Owner control: permanently remove a dead-letter job record. */
export async function removeDeadLetterAiJob(jobId: number): Promise<boolean> {
  const result = await prisma.inventoryAiJob.deleteMany({
    where: { id: jobId, status: AI_JOB_STATUS.DEAD_LETTER },
  });
  return result.count > 0;
}

export async function enqueueRepairJobs(limit = 200): Promise<number> {
  const engine = CURRENT_PIPELINE_VERSION;
  const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
    `SELECT c.id AS item_id
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (
         p.item_id IS NULL
         OR p.ai_status IS DISTINCT FROM 'READY'
         OR COALESCE(p.needs_reindex, false) = true
         OR COALESCE(p.matching_version, 0) < $1
         OR COALESCE(p.recognition_version, 0) < $1
         OR COALESCE(NULLIF(regexp_replace(COALESCE(p.pipeline_version, '0'), '[^0-9]', '', 'g'), ''), '0')::int < $1
        OR COALESCE(NULLIF(regexp_replace(c.identification_index->>'version', '[^0-9]', '', 'g'), ''), '0')::int < $2
         OR p.dominant_color IS NULL
         OR (p.colour_analysis IS NULL AND p.dominant_color IS NULL)
         OR p.embedding_vector IS NULL
         OR p.embroidery_signature IS NULL
         OR p.border_signature IS NULL
         OR p.motif_signature IS NULL
         OR p.texture_signature IS NULL
         OR p.panel_signature IS NULL
         OR p.stone_signature IS NULL
         OR COALESCE(p.has_identification_index, false) = false
       )
     ORDER BY c.id ASC
     LIMIT $3`,
    engine,
    IDENTIFICATION_INDEX_VERSION,
    limit,
  );

  let n = 0;
  for (const row of rows) {
    await enqueueInventoryAiJob({
      itemId: Number(row.item_id),
      reason: "nightly_repair",
      priority: 50,
      staleExisting: true,
    });
    n++;
  }
  return n;
}

/** Mark all profiles below current engine version as STALE and enqueue reindex. */
export async function markOutdatedProfilesStaleAndEnqueue(): Promise<number> {
  const outdated = await prisma.inventoryAiProfile.findMany({
    where: {
      OR: [
        { matchingVersion: { lt: CURRENT_MATCHING_VERSION } },
        { recognitionVersion: { lt: CURRENT_RECOGNITION_VERSION } },
        {
          NOT: {
            pipelineVersion: {
              in: [String(CURRENT_PIPELINE_VERSION), `${CURRENT_PIPELINE_VERSION}`],
            },
          },
        },
      ],
    },
    select: { itemId: true },
    take: 500,
  });

  for (const row of outdated) {
    await enqueueInventoryAiJob({
      itemId: row.itemId,
      reason: `version_bump_to_${CURRENT_PIPELINE_VERSION}`,
      priority: 40,
      staleExisting: true,
    });
  }
  return outdated.length;
}

export async function getAiJobQueueStats() {
  const groups = await prisma.inventoryAiJob.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count.id]));

  const now = Date.now();
  const [oldestPending, oldestProcessing, lastSuccessful] = await Promise.all([
    prisma.inventoryAiJob.findFirst({
      where: { status: AI_JOB_STATUS.PENDING },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true, id: true },
    }),
    prisma.inventoryAiJob.findFirst({
      where: { status: AI_JOB_STATUS.PROCESSING },
      orderBy: [{ lockedAt: "asc" }, { startedAt: "asc" }, { id: "asc" }],
      select: { lockedAt: true, startedAt: true, createdAt: true, id: true },
    }),
    prisma.inventoryAiJob.findFirst({
      where: { status: AI_JOB_STATUS.READY, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, id: true },
    }),
  ]);

  const pendingAt = oldestPending?.createdAt ?? null;
  const processingAt =
    oldestProcessing?.lockedAt ??
    oldestProcessing?.startedAt ??
    oldestProcessing?.createdAt ??
    null;

  return {
    pending: counts.PENDING ?? 0,
    processing: counts.PROCESSING ?? 0,
    ready: counts.READY ?? 0,
    failed: counts.FAILED ?? 0,
    retrying: counts.RETRYING ?? 0,
    stale: counts.STALE ?? 0,
    cancelled: counts.CANCELLED ?? 0,
    deadLetter: counts.DEAD_LETTER ?? 0,
    workerId: WORKER_ID,
    oldestPendingAt: pendingAt ? pendingAt.toISOString() : null,
    oldestPendingAgeMs: pendingAt ? Math.max(0, now - pendingAt.getTime()) : null,
    oldestProcessingAt: processingAt ? processingAt.toISOString() : null,
    oldestProcessingAgeMs: processingAt
      ? Math.max(0, now - processingAt.getTime())
      : null,
    lastSuccessfulJobAt: lastSuccessful?.completedAt
      ? lastSuccessful.completedAt.toISOString()
      : null,
    lastSuccessfulJobId: lastSuccessful?.id ?? null,
  };
}

/** Recover PROCESSING jobs whose lease (lockedAt/startedAt) has expired. */
export async function recoverExpiredProcessingLeases(
  leaseMs = 8 * 60_000,
): Promise<{ recovered: number; jobIds: number[]; itemIds: number[] }> {
  const cutoff = new Date(Date.now() - leaseMs);
  const stuck = await prisma.inventoryAiJob.findMany({
    where: {
      status: AI_JOB_STATUS.PROCESSING,
      OR: [
        { lockedAt: { lt: cutoff } },
        { AND: [{ lockedAt: null }, { startedAt: { lt: cutoff } }] },
        {
          AND: [
            { lockedAt: null },
            { startedAt: null },
            { updatedAt: { lt: cutoff } },
          ],
        },
      ],
    },
    select: { id: true, itemId: true, retryCount: true, maxRetries: true },
    take: 100,
  });

  const jobIds: number[] = [];
  const itemIds: number[] = [];
  for (const job of stuck) {
    const canRetry = job.retryCount < job.maxRetries;
    await prisma.inventoryAiJob.update({
      where: { id: job.id },
      data: {
        status: canRetry ? AI_JOB_STATUS.RETRYING : AI_JOB_STATUS.DEAD_LETTER,
        retryCount: canRetry ? job.retryCount + 1 : job.retryCount,
        nextRetryAt: canRetry ? new Date() : null,
        lockedAt: null,
        lockedBy: null,
        completedAt: canRetry ? null : new Date(),
        errorMessage: canRetry
          ? `Lease expired after ${Math.round(leaseMs / 60000)}m — recovered for retry`
          : `Lease expired after ${Math.round(leaseMs / 60000)}m — moved to dead letter`,
        lastError: `Expired PROCESSING lease recovered at ${new Date().toISOString()}`,
      },
    });
    jobIds.push(job.id);
    itemIds.push(job.itemId);
  }
  if (jobIds.length) {
    console.warn(`[ai-queue] recovered ${jobIds.length} expired PROCESSING leases`);
  }
  return { recovered: jobIds.length, jobIds, itemIds };
}

/** Retry FAILED jobs that look transient (not deterministic native/size failures). */
export async function retrySafeFailedAiJobs(limit = 50): Promise<number> {
  const failed = await prisma.inventoryAiJob.findMany({
    where: { status: AI_JOB_STATUS.FAILED },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, lastError: true, errorMessage: true },
  });
  let n = 0;
  for (const job of failed) {
    const msg = `${job.lastError || ""} ${job.errorMessage || ""}`;
    if (DETERMINISTIC_FAILURE_RE.test(msg)) continue;
    const ok = await retryOneAiJob(job.id);
    if (ok) n += 1;
  }
  return n;
}

/** Move a single failed/retrying/processing job with a deterministic error to dead letter. */
export async function moveDeterministicFailureToDeadLetter(jobId: number): Promise<boolean> {
  const result = await prisma.inventoryAiJob.updateMany({
    where: {
      id: jobId,
      status: {
        in: [
          AI_JOB_STATUS.FAILED,
          AI_JOB_STATUS.RETRYING,
          AI_JOB_STATUS.PROCESSING,
          AI_JOB_STATUS.PENDING,
        ],
      },
    },
    data: {
      status: AI_JOB_STATUS.DEAD_LETTER,
      lockedAt: null,
      lockedBy: null,
      nextRetryAt: null,
      completedAt: new Date(),
      errorMessage: "[DEAD_LETTER] Deterministic failure — owner marked",
      lastError: "Owner moved deterministic failure to dead letter",
    },
  });
  return result.count > 0;
}
