/**
 * Worker-side AI job queue operations (claim / complete / fail).
 * Normal routes must import `./aiJobClient` instead — never this module.
 */
import { hostname } from "os";
import prisma from "@/lib/prisma";
import {
  AI_STATUS,
  legacyStatusFromAi,
} from "./profileReadiness";
import {
  AI_JOB_STATUS,
  nextRetryAt,
} from "./aiJobTypes";

// Re-export client + types so existing worker/admin imports keep working.
export {
  AI_JOB_STATUS,
  DEFAULT_MAX_RETRIES,
  RETRY_DELAYS_MS,
  nextRetryAt,
  type AiJobStatus,
  type EnqueueAiJobInput,
} from "./aiJobTypes";
export {
  enqueueInventoryAiJob,
  enqueueRepairJobs,
  getAiJobQueueStats,
  ignoreDeadLetterAiJob,
  markOutdatedProfilesStaleAndEnqueue,
  moveDeterministicFailureToDeadLetter,
  recoverExpiredProcessingLeases,
  removeDeadLetterAiJob,
  resumeDeadLetterAiJobs,
  resumeFailedAiJobs,
  retryOneAiJob,
  retrySafeFailedAiJobs,
} from "./aiJobClient";

const WORKER_ID = `${hostname()}:${process.pid}`;

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
  const nextAttempt = opts.retryCount;
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
