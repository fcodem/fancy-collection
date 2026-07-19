/** Shared AI job queue types and constants — no Prisma, no native deps. */

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

/** Hard cap per job invocation (cron maxDuration is 60s; leave headroom). */
export const AI_JOB_TIMEOUT_MS = Number(process.env.AI_JOB_TIMEOUT_MS || 50_000);

/** Native/OOM/size failures — dead-letter immediately, never retry forever. */
export const DETERMINISTIC_FAILURE_RE =
  /invalid size|SIGABRT|heap|out of memory|ENOMEM|ENOSPC|no space left|Input image exceeds|limitInputPixels|corrupted size vs prev_size|timed out after/i;

export function nextRetryAt(retryCount: number): Date | null {
  const delay = RETRY_DELAYS_MS[retryCount];
  if (delay == null) return null;
  return new Date(Date.now() + delay);
}

export function isDeterministicFailure(message: string): boolean {
  return DETERMINISTIC_FAILURE_RE.test(message);
}

export type EnqueueAiJobInput = {
  itemId: number;
  reason?: string;
  priority?: number;
  /** Mark existing READY profile STALE before enqueue (photo change). */
  staleExisting?: boolean;
};
