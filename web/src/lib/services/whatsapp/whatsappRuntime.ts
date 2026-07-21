/** Shared WhatsApp cron / slip job runtime budgets (must stay below Vercel maxDuration). */

import type { SlipRenderTimeoutStage } from "./slipRenderErrors";

export type { SlipRenderTimeoutStage };

export const VERCEL_WHATSAPP_MAX_DURATION_MS = 60_000;
export const WHATSAPP_CRON_SAFE_BUDGET_MS = 45_000;
export const WHATSAPP_SLIP_JOB_TIMEOUT_MS = 38_000;
export const WHATSAPP_TEXT_JOB_TIMEOUT_MS = 15_000;
export const WHATSAPP_MIN_REMAINING_TO_START_SLIP_MS = 40_000;
export const WHATSAPP_MIN_REMAINING_TO_START_TEXT_MS = 10_000;
export const WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS = 31_000;

/** Renderer stage ceilings — total must stay below WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS. */
export const WHATSAPP_RENDERER_STAGE_MS = {
  chromiumPrep: 8_000,
  browserLaunch: 8_000,
  navigation: 8_000,
  domValidation: 3_000,
  pdfGeneration: 8_000,
} as const;

export const HEAVY_WHATSAPP_JOB_TYPES = new Set([
  "booking_bill",
  "delivery_slip",
  "return_slip",
  "return_receipt",
  "incomplete_slip",
]);

export const LIGHT_WHATSAPP_JOB_TYPES = new Set([
  "postponement_notice",
  "postponement_held",
  "booking_reminder",
  "custom_template",
]);

export function isHeavyWhatsAppJobType(jobType: string): boolean {
  return HEAVY_WHATSAPP_JOB_TYPES.has(jobType);
}

export function isLightWhatsAppJobType(jobType: string): boolean {
  return LIGHT_WHATSAPP_JOB_TYPES.has(jobType);
}

export function whatsAppJobTimeoutMs(jobType: string): number {
  return isHeavyWhatsAppJobType(jobType)
    ? WHATSAPP_SLIP_JOB_TIMEOUT_MS
    : WHATSAPP_TEXT_JOB_TIMEOUT_MS;
}

export function minRemainingToStartWhatsAppJobMs(jobType: string): number {
  return isHeavyWhatsAppJobType(jobType)
    ? WHATSAPP_MIN_REMAINING_TO_START_SLIP_MS
    : WHATSAPP_MIN_REMAINING_TO_START_TEXT_MS;
}

export function canStartWhatsAppJobWithBudget(
  jobType: string,
  remainingBudgetMs: number,
  heavyJobsStarted: number,
  maxHeavyJobs: number,
): boolean {
  if (isHeavyWhatsAppJobType(jobType)) {
    if (heavyJobsStarted >= maxHeavyJobs) return false;
    return remainingBudgetMs >= WHATSAPP_MIN_REMAINING_TO_START_SLIP_MS;
  }
  return remainingBudgetMs >= WHATSAPP_MIN_REMAINING_TO_START_TEXT_MS;
}

/** Stuck recovery must exceed the longest single job timeout. */
export const WHATSAPP_STUCK_PROCESSING_MS = WHATSAPP_SLIP_JOB_TIMEOUT_MS + 30_000;
export const WHATSAPP_JOB_LEASE_MS = WHATSAPP_STUCK_PROCESSING_MS + 15_000;

export type ProcessWhatsAppJobQueueOptions = {
  bookingId?: number;
  maxJobs?: number;
  maxHeavyJobs?: number;
  runtimeBudgetMs?: number;
};

export function normalizeProcessWhatsAppJobQueueOptions(
  limitOrOptions?: number | ProcessWhatsAppJobQueueOptions,
  legacyOptions?: { bookingId?: number },
): ProcessWhatsAppJobQueueOptions {
  if (typeof limitOrOptions === "number") {
    return {
      maxJobs: limitOrOptions,
      maxHeavyJobs: 1,
      runtimeBudgetMs: WHATSAPP_CRON_SAFE_BUDGET_MS,
      bookingId: legacyOptions?.bookingId,
    };
  }
  const opts = limitOrOptions ?? {};
  return {
    maxJobs: opts.maxJobs ?? 3,
    maxHeavyJobs: opts.maxHeavyJobs ?? 1,
    runtimeBudgetMs: opts.runtimeBudgetMs ?? WHATSAPP_CRON_SAFE_BUDGET_MS,
    bookingId: opts.bookingId ?? legacyOptions?.bookingId,
  };
}

export function premiumSlipRenderTimeoutMessage(): string {
  return "Premium slip rendering timed out — Meta was not contacted.";
}

export function linkAbortSignal(
  controller: AbortController,
  parent?: AbortSignal,
): () => void {
  if (!parent) return () => {};
  if (parent.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  parent.addEventListener("abort", onAbort, { once: true });
  return () => parent.removeEventListener("abort", onAbort);
}

export async function runWithAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const unlink = linkAbortSignal(controller, parentSignal);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      const reason = err instanceof Error ? err.message : "aborted";
      throw new Error(reason.includes("aborted") ? reason : `Operation aborted after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

export async function runStageWithTimeout<T>(
  stage: SlipRenderTimeoutStage,
  ms: number,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    const { SlipRenderTimeoutError } = await import("./slipRenderErrors");
    throw new SlipRenderTimeoutError(stage);
  }
  return runWithAbortTimeout(
    async (stageSignal) => {
      if (stageSignal.aborted) {
        const { SlipRenderTimeoutError } = await import("./slipRenderErrors");
        throw new SlipRenderTimeoutError(stage);
      }
      return fn();
    },
    ms,
    signal,
  );
}
