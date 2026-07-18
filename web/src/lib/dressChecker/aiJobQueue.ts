/**
 * Durable Postgres-backed AI indexing job queue.
 * Survives process/server restart (no Redis required).
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

export const AI_JOB_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  RETRYING: "RETRYING",
  STALE: "STALE",
  CANCELLED: "CANCELLED",
  /** Exhausted retries — dead-letter; requires admin/self-heal resume. */
  DEAD_LETTER: "DEAD_LETTER",
} as const;

export type AiJobStatus = (typeof AI_JOB_STATUS)[keyof typeof AI_JOB_STATUS];

/** Attempt 1 → 30s, 2 → 2m, 3 → 10m, then FAILED. */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;
export const DEFAULT_MAX_RETRIES = 3;

const WORKER_ID = `${hostname()}:${process.pid}`;

export function nextRetryAt(retryCount: number): Date | null {
  const delay = RETRY_DELAYS_MS[retryCount];
  if (delay == null) return null;
  return new Date(Date.now() + delay);
}

export type EnqueueAiJobInput = {
  itemId: number;
  reason?: string;
  priority?: number;
  /** Mark existing READY profile STALE before enqueue (photo change). */
  staleExisting?: boolean;
};

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

/** Atomically claim the next runnable job. */
export async function claimNextAiJob(): Promise<{
  id: number;
  itemId: number;
  reason: string;
  retryCount: number;
  maxRetries: number;
} | null> {
  const now = new Date();
  const candidates = await prisma.inventoryAiJob.findMany({
    where: {
      OR: [
        { status: AI_JOB_STATUS.PENDING },
        {
          status: AI_JOB_STATUS.RETRYING,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
      ],
    },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    take: 5,
  });

  for (const job of candidates) {
    const updated = await prisma.inventoryAiJob.updateMany({
      where: {
        id: job.id,
        status: { in: [AI_JOB_STATUS.PENDING, AI_JOB_STATUS.RETRYING] },
      },
      data: {
        status: AI_JOB_STATUS.PROCESSING,
        startedAt: now,
        lockedAt: now,
        lockedBy: WORKER_ID,
        errorMessage: null,
      },
    });
    if (updated.count === 1) {
      return {
        id: job.id,
        itemId: job.itemId,
        reason: job.reason,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
      };
    }
  }
  return null;
}

export async function completeAiJob(jobId: number): Promise<void> {
  await prisma.inventoryAiJob.update({
    where: { id: jobId },
    data: {
      status: AI_JOB_STATUS.READY,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorMessage: null,
      lastError: null,
      nextRetryAt: null,
    },
  });
}

export async function failOrRetryAiJob(
  jobId: number,
  error: string,
  opts: { retryCount: number; maxRetries: number; itemId: number },
): Promise<"RETRYING" | "FAILED" | "DEAD_LETTER"> {
  const nextAttempt = opts.retryCount; // 0-based completed attempts before this failure
  const retryAt = nextRetryAt(nextAttempt);
  const canRetry = nextAttempt < opts.maxRetries && retryAt != null;

  if (canRetry) {
    await prisma.inventoryAiJob.update({
      where: { id: jobId },
      data: {
        status: AI_JOB_STATUS.RETRYING,
        retryCount: opts.retryCount + 1,
        lastError: error,
        errorMessage: error,
        nextRetryAt: retryAt,
        lockedAt: null,
        lockedBy: null,
      },
    });
    await prisma.inventoryAiProfile.updateMany({
      where: { itemId: opts.itemId },
      data: {
        aiStatus: AI_STATUS.RETRYING,
        status: legacyStatusFromAi(AI_STATUS.RETRYING),
        needsReindex: true,
        indexFailureReason: `Retrying (${opts.retryCount + 1}/${opts.maxRetries}): ${error}`,
        error,
        processingError: error,
      },
    });
    return "RETRYING";
  }

  // Dead-letter after exponential backoff exhausted.
  await prisma.inventoryAiJob.update({
    where: { id: jobId },
    data: {
      status: AI_JOB_STATUS.DEAD_LETTER,
      retryCount: opts.retryCount + 1,
      lastError: error,
      errorMessage: `[DEAD_LETTER] ${error}`,
      completedAt: new Date(),
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
    },
  });
  await prisma.inventoryAiProfile.updateMany({
    where: { itemId: opts.itemId },
    data: {
      aiStatus: AI_STATUS.FAILED,
      status: legacyStatusFromAi(AI_STATUS.FAILED),
      needsReindex: true,
      indexFailureReason: `Dead-letter after ${opts.maxRetries} retries: ${error}`,
      error,
      processingError: error,
    },
  });
  return "DEAD_LETTER";
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
  };
}
