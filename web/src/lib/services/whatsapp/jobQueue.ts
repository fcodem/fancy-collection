import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatDate, parseDate } from "@/lib/constants";
import {
  sendBookingBillWhatsApp,
  sendPostponementNoticeWhatsApp,
  sendPostponementHeldWhatsApp,
  sendReturnReceiptWhatsApp,
  sendDeliverySlipWhatsApp,
  sendPartialReturnSlipWhatsApp,
  sendIncompleteSlipWhatsApp,
} from "./automatedMessages";
import { isWhatsAppReceiptJobType, isWhatsAppReceiptsDisabled } from "./metaApi";
import { mergeSendMetaIntoPayload } from "./jobSendMeta";
import {
  formatJobFailedReason,
  isPremiumSlipRenderFailureMessage,
  isProviderOutcomeUnknownReason,
  providerOutcomeForFailure,
  canSafelyRetryWhatsAppJob,
  isWhatsAppRenderFailureReason,
  sendStageForFailure,
} from "./whatsappProviderOutcome";
import { isPremiumRenderFailureRetryable } from "./slipRenderErrors";
import {
  listClassifiedWhatsAppRenderFailures,
  type SafeRenderRetrySummary,
} from "./whatsappJobClassification";
import { PREMIUM_SLIP_RENDER_FAILED } from "@/lib/premiumSlip";
import {
  markWhatsAppProviderSendConfirmed,
} from "./whatsappSendLedger";
import type { WhatsAppJobSendContext } from "./whatsappJobSendContext";

export type WhatsAppJobType =
  | "postponement_notice"
  | "postponement_held"
  | "booking_bill"
  | "booking_reminder"
  | "delivery_slip"
  | "return_slip"
  | "return_receipt"
  | "incomplete_slip"
  | "custom_template";

type JobPayload = Record<string, unknown>;

function outcomeFromSend(
  result: {
    ok: boolean;
    skipped?: boolean;
    error?: string;
    phone?: string;
    messageId?: string;
    renderer?: string;
    premiumFailureCategory?: string;
    premiumRenderError?: string;
  },
  fallbackError: string,
): {
  phone?: string;
  messageId?: string;
  renderer?: string;
  premiumFailureCategory?: string;
  premiumRenderError?: string;
} {
  if (result.ok) {
    return {
      phone: result.phone,
      messageId: result.messageId,
      renderer: result.renderer,
      premiumFailureCategory: result.premiumFailureCategory,
      premiumRenderError: result.premiumRenderError,
    };
  }
  if (result.skipped) {
    return { phone: result.phone };
  }
  throw new Error(result.error || fallbackError);
}

const JOB_TIMEOUT_MS = 120_000;
/** Must exceed JOB_TIMEOUT_MS so legitimate long PDF work is not reclaimed mid-run. */
const STUCK_PROCESSING_MS = 180_000;
const LEASE_MS = JOB_TIMEOUT_MS + 60_000;

/** Open jobs that block a normal (non-force) schedule for the same key. */
const OPEN_WA_JOB_STATUSES = ["pending", "processing"] as const;

export type WhatsAppScheduleOptions = {
  /** Create a new idempotency key so a completed slip can be resent. */
  forceResend?: boolean;
};

function withJobTimeout<T>(promise: Promise<T>, jobId: number, jobType: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Job #${jobId} (${jobType}) timed out after ${JOB_TIMEOUT_MS / 1000}s`)),
        JOB_TIMEOUT_MS,
      );
    }),
  ]);
}

/** Reset jobs left in processing after a crash or expired lease. */
export async function recoverStuckWhatsAppJobs(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MS);
  const result = await prisma.whatsAppJob.updateMany({
    where: {
      status: "processing",
      OR: [
        { leaseExpiresAt: { lt: now } },
        { leaseExpiresAt: null, lastAttemptAt: { lt: cutoff } },
        { leaseExpiresAt: null, lastAttemptAt: null },
      ],
    },
    data: {
      status: "pending",
      claimedAt: null,
      leaseExpiresAt: null,
      claimedBy: null,
      failedReason: "Recovered from stuck processing — will retry",
    },
  });
  return result.count;
}

/**
 * Atomically claim pending jobs via FOR UPDATE SKIP LOCKED.
 * Falls back to conditional updateMany when lease columns are absent.
 */
async function claimPendingWhatsAppJobs(
  limit: number,
  options?: { bookingId?: number },
): Promise<
  Array<{
    id: number;
    jobType: string;
    bookingId: number | null;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
    idempotencyKey: string | null;
  }>
> {
  const workerId = `w-${process.env.VERCEL_REGION || "local"}-${Date.now().toString(36)}`;
  const now = new Date();
  const leaseExpires = new Date(Date.now() + LEASE_MS);

  try {
    type ClaimRow = {
      id: number;
      jobType: string;
      bookingId: number | null;
      payload: unknown;
      attempts: number;
      maxAttempts: number;
      idempotencyKey: string | null;
    };
    if (options?.bookingId != null) {
      const bookingId = options.bookingId;
      return await prisma.$queryRaw<ClaimRow[]>`
        UPDATE whatsapp_jobs AS j
        SET
          status = 'processing',
          attempts = j.attempts + 1,
          last_attempt_at = ${now},
          claimed_at = ${now},
          lease_expires_at = ${leaseExpires},
          claimed_by = ${workerId}
        WHERE j.id IN (
          SELECT id FROM whatsapp_jobs
          WHERE status = 'pending'
            AND scheduled_at <= ${now}
            AND booking_id = ${bookingId}
          ORDER BY scheduled_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        RETURNING j.id, j.job_type AS "jobType", j.booking_id AS "bookingId",
                  j.payload, j.attempts, j.max_attempts AS "maxAttempts",
                  j.idempotency_key AS "idempotencyKey"
      `;
    }
    return await prisma.$queryRaw<ClaimRow[]>`
      UPDATE whatsapp_jobs AS j
      SET
        status = 'processing',
        attempts = j.attempts + 1,
        last_attempt_at = ${now},
        claimed_at = ${now},
        lease_expires_at = ${leaseExpires},
        claimed_by = ${workerId}
      WHERE j.id IN (
        SELECT id FROM whatsapp_jobs
        WHERE status = 'pending'
          AND scheduled_at <= ${now}
        ORDER BY scheduled_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING j.id, j.job_type AS "jobType", j.booking_id AS "bookingId",
                j.payload, j.attempts, j.max_attempts AS "maxAttempts",
                j.idempotency_key AS "idempotencyKey"
    `;
  } catch {
    const primary = await prisma.whatsAppJob.findMany({
      where: {
        status: "pending",
        scheduledAt: { lte: now },
        ...(options?.bookingId != null ? { bookingId: options.bookingId } : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    const claimed: Array<{
      id: number;
      jobType: string;
      bookingId: number | null;
      payload: unknown;
      attempts: number;
      maxAttempts: number;
      idempotencyKey: string | null;
    }> = [];
    for (const job of primary) {
      const updated = await prisma.whatsAppJob.updateMany({
        where: { id: job.id, status: "pending" },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });
      if (updated.count === 1) {
        claimed.push({
          id: job.id,
          jobType: job.jobType,
          bookingId: job.bookingId,
          payload: job.payload,
          attempts: job.attempts + 1,
          maxAttempts: job.maxAttempts,
          idempotencyKey: job.idempotencyKey ?? null,
        });
      }
    }
    return claimed;
  }
}

async function cancelPendingJobs(bookingId: number, jobType: WhatsAppJobType) {
  await prisma.whatsAppJob.updateMany({
    where: { bookingId, jobType, status: "pending" },
    data: { status: "cancelled" },
  });
}

export async function schedulePostponementHeld(
  bookingId: number,
  createdBy?: string,
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  await cancelPendingJobs(bookingId, "postponement_held");
  return prisma.whatsAppJob.create({
    data: {
      jobType: "postponement_held",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: {},
    },
  });
}

export async function schedulePostponementNotice(
  bookingId: number,
  oldDeliveryDate: string,
  newDeliveryDate: string,
  newReturnDate: string,
  reason?: string,
  createdBy?: string,
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  await cancelPendingJobs(bookingId, "postponement_notice");
  return prisma.whatsAppJob.create({
    data: {
      jobType: "postponement_notice",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: {
        oldDeliveryDate,
        newDeliveryDate,
        newReturnDate,
        reason: reason ?? null,
      },
    },
  });
}

export async function scheduleBookingBillInTx(
  tx: Prisma.TransactionClient,
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  if (isWhatsAppReceiptsDisabled()) return null;

  const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
  const version = opts?.forceResend ? `resend-${Date.now()}` : "v1";
  const idempotencyKey = buildWhatsAppIdempotencyKey("booking_bill", bookingId, [], version);

  if (!opts?.forceResend) {
    const existing = await tx.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...OPEN_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;
  }

  try {
    return await tx.whatsAppJob.create({
      data: {
        jobType: "booking_bill",
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: {
          requestOrigin: requestOrigin ?? null,
          ...(opts?.forceResend ? { forceResend: true } : {}),
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "P2002" || /idempotency|Unique constraint/i.test(msg)) {
      const raced = await tx.whatsAppJob.findFirst({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    throw e;
  }
}

export async function scheduleBookingBill(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  if (!opts?.forceResend) {
    // Fast path outside a booking create TX
    const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
    const idempotencyKey = buildWhatsAppIdempotencyKey("booking_bill", bookingId);
    const existing = await prisma.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...OPEN_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;
    await cancelPendingJobs(bookingId, "booking_bill");
  }
  return prisma.$transaction((tx) =>
    scheduleBookingBillInTx(tx, bookingId, requestOrigin, createdBy, opts),
  );
}

export async function scheduleReturnReceipt(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
  if (isWhatsAppReceiptsDisabled()) return null;

  const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
  const idempotencyKey = buildWhatsAppIdempotencyKey("return_receipt", bookingId);

  const existing = await prisma.whatsAppJob.findFirst({
    where: { idempotencyKey, status: { in: [...OPEN_WA_JOB_STATUSES] } },
  });
  if (existing) return existing;

  await cancelPendingJobs(bookingId, "return_receipt");

  try {
    return await prisma.whatsAppJob.create({
      data: {
        jobType: "return_receipt",
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: { requestOrigin: requestOrigin ?? null },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "P2002" || /idempotency|Unique constraint/i.test(msg)) {
      const raced = await prisma.whatsAppJob.findFirst({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    if (/does not exist|Unknown arg|P2021/i.test(msg)) {
      throw new Error("WhatsApp job idempotency schema unavailable");
    }
    throw e;
  }
}

export async function scheduleDeliverySlipInTx(
  tx: Prisma.TransactionClient,
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  if (isWhatsAppReceiptsDisabled()) return null;

  const itemIds =
    payload.bookingItemIds?.length
      ? payload.bookingItemIds
      : payload.bookingItemId
        ? [payload.bookingItemId]
        : [];

  const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
  const version = opts?.forceResend
    ? `${payload.scope}:resend-${Date.now()}`
    : payload.scope;
  const idempotencyKey = buildWhatsAppIdempotencyKey(
    "delivery_slip",
    bookingId,
    itemIds,
    version,
  );

  if (!opts?.forceResend) {
    const existing = await tx.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...OPEN_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;
  }

  try {
    return await tx.whatsAppJob.create({
      data: {
        jobType: "delivery_slip",
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: {
          ...payload,
          requestOrigin: requestOrigin ?? null,
          ...(opts?.forceResend ? { forceResend: true } : {}),
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "P2002" || /idempotency|Unique constraint/i.test(msg)) {
      const raced = await tx.whatsAppJob.findFirst({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    throw e;
  }
}

export async function scheduleDeliverySlip(
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  return prisma.$transaction((tx) =>
    scheduleDeliverySlipInTx(tx, bookingId, payload, requestOrigin, createdBy, opts),
  );
}

export async function scheduleReturnSlipInTx(
  tx: Prisma.TransactionClient,
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  return scheduleKeyedSlipJobInTx(
    tx,
    "return_slip",
    bookingId,
    payload,
    requestOrigin,
    createdBy,
    opts,
  );
}

export async function scheduleIncompleteSlipInTx(
  tx: Prisma.TransactionClient,
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  return scheduleKeyedSlipJobInTx(
    tx,
    "incomplete_slip",
    bookingId,
    payload,
    requestOrigin,
    createdBy,
    opts,
  );
}

async function scheduleKeyedSlipJobInTx(
  tx: Prisma.TransactionClient,
  jobType: "return_slip" | "incomplete_slip",
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  if (isWhatsAppReceiptsDisabled()) return null;

  const itemIds =
    payload.bookingItemIds?.length
      ? payload.bookingItemIds
      : payload.bookingItemId
        ? [payload.bookingItemId]
        : [];

  const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
  const version = opts?.forceResend
    ? `${payload.scope}:resend-${Date.now()}`
    : payload.scope;
  const idempotencyKey = buildWhatsAppIdempotencyKey(jobType, bookingId, itemIds, version);

  if (!opts?.forceResend) {
    const existing = await tx.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...OPEN_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;
  }

  try {
    return await tx.whatsAppJob.create({
      data: {
        jobType,
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: {
          scope: payload.scope,
          bookingItemId: payload.bookingItemId ?? null,
          bookingItemIds: itemIds,
          requestOrigin: requestOrigin ?? null,
          ...(opts?.forceResend ? { forceResend: true } : {}),
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const code = (e as { code?: string })?.code;
    if (code === "P2002" || /idempotency|Unique constraint/i.test(msg)) {
      const raced = await tx.whatsAppJob.findFirst({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    throw e;
  }
}

export async function scheduleReturnSlip(
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  return prisma.$transaction((tx) =>
    scheduleReturnSlipInTx(tx, bookingId, payload, requestOrigin, createdBy, opts),
  );
}

export async function scheduleIncompleteSlip(
  bookingId: number,
  payload: {
    scope: "full" | "single" | "combined";
    bookingItemId?: number;
    bookingItemIds?: number[];
  },
  requestOrigin?: string,
  createdBy?: string,
  opts?: WhatsAppScheduleOptions,
) {
  return prisma.$transaction((tx) =>
    scheduleIncompleteSlipInTx(tx, bookingId, payload, requestOrigin, createdBy, opts),
  );
}

async function executeJob(
  job: {
    id: number;
    jobType: string;
    bookingId: number | null;
    payload: unknown;
    attempts: number;
    maxAttempts: number;
    idempotencyKey: string | null;
  },
  sendContext: WhatsAppJobSendContext,
): Promise<{
  phone?: string;
  messageId?: string;
  renderer?: string;
  premiumFailureCategory?: string;
  premiumRenderError?: string;
}> {
  if (!job.bookingId) throw new Error("Job missing bookingId");

  const payload = (job.payload ?? {}) as JobPayload;

  if (isWhatsAppReceiptsDisabled() && isWhatsAppReceiptJobType(job.jobType)) {
    console.info(`[whatsapp] Skipping ${job.jobType} #${job.id} — receipts paused`);
    return {};
  }

  switch (job.jobType as WhatsAppJobType) {
    case "booking_bill": {
      const result = await sendBookingBillWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
        sendContext,
      );
      return outcomeFromSend(result, "Booking bill send failed");
    }
    case "postponement_held": {
      const result = await sendPostponementHeldWhatsApp(job.bookingId, sendContext);
      return outcomeFromSend(result, "Postponement held notice failed");
    }
    case "booking_reminder":
      console.info(`[whatsapp] Skipping deprecated booking_reminder job #${job.id}`);
      return {};
    case "postponement_notice": {
      const result = await sendPostponementNoticeWhatsApp(job.bookingId, {
        oldDeliveryDate: String(payload.oldDeliveryDate || ""),
        newDeliveryDate: String(payload.newDeliveryDate || ""),
        newReturnDate: String(payload.newReturnDate || ""),
        reason: typeof payload.reason === "string" ? payload.reason : undefined,
      }, sendContext);
      return outcomeFromSend(result, "Postponement notice failed");
    }
    case "return_receipt": {
      const result = await sendReturnReceiptWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
        sendContext,
      );
      return outcomeFromSend(result, "Return receipt send failed");
    }
    case "delivery_slip": {
      const scope = payload.scope as "full" | "single" | "combined";
      const bookingItemIds = Array.isArray(payload.bookingItemIds)
        ? (payload.bookingItemIds as number[]).filter((id) => typeof id === "number")
        : undefined;
      const result = await sendDeliverySlipWhatsApp(
        job.bookingId,
        {
          scope: scope || "full",
          bookingItemId:
            typeof payload.bookingItemId === "number" ? payload.bookingItemId : undefined,
          bookingItemIds,
        },
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
        sendContext,
      );
      return outcomeFromSend(result, "Delivery slip send failed");
    }
    case "return_slip": {
      const scope = payload.scope as "full" | "single" | "combined";
      const bookingItemIds = Array.isArray(payload.bookingItemIds)
        ? (payload.bookingItemIds as number[]).filter((id) => typeof id === "number")
        : undefined;
      const result = await sendPartialReturnSlipWhatsApp(
        job.bookingId,
        {
          scope: scope || "combined",
          bookingItemId:
            typeof payload.bookingItemId === "number" ? payload.bookingItemId : undefined,
          bookingItemIds,
        },
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
        sendContext,
      );
      return outcomeFromSend(result, "Return slip send failed");
    }
    case "incomplete_slip": {
      const scope = payload.scope as "full" | "single" | "combined";
      const bookingItemIds = Array.isArray(payload.bookingItemIds)
        ? (payload.bookingItemIds as number[]).filter((id) => typeof id === "number")
        : undefined;
      const result = await sendIncompleteSlipWhatsApp(
        job.bookingId,
        {
          scope: scope || "combined",
          bookingItemId:
            typeof payload.bookingItemId === "number" ? payload.bookingItemId : undefined,
          bookingItemIds,
        },
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
        sendContext,
      );
      return outcomeFromSend(result, "Incomplete slip send failed");
    }
    default:
      throw new Error(`Unsupported job type: ${job.jobType}`);
  }
}

function premiumRenderRetryDelayMs(attempts: number): number {
  if (attempts <= 1) return 30_000;
  if (attempts === 2) return 120_000;
  return 600_000;
}

export async function processWhatsAppJobQueue(
  limit = 3,
  options?: { bookingId?: number },
) {
  const RUNTIME_BUDGET_MS = 45_000;
  const batchStartedAt = Date.now();

  await recoverStuckWhatsAppJobs();

  const jobs = await claimPendingWhatsAppJobs(limit, options);

  const results: Array<{
    jobId: number;
    jobType: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
    const job = jobs[jobIndex];
    if (Date.now() - batchStartedAt > RUNTIME_BUDGET_MS) {
      const remainingIds = jobs.slice(jobIndex).map((j) => j.id);
      console.info(
        `[whatsapp] Runtime budget exhausted — releasing ${remainingIds.length} job(s) back to pending`,
      );
      await prisma.whatsAppJob.updateMany({
        where: { id: { in: remainingIds }, status: "processing" },
        data: {
          status: "pending",
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
        },
      });
      break;
    }

    const idempotencyKey = job.idempotencyKey;
    const sendContext: WhatsAppJobSendContext = {
      jobId: job.id,
      idempotencyKey,
      bookingId: job.bookingId,
    };

    try {
      if (idempotencyKey) {
        try {
          const ledger = await prisma.whatsAppSendLedger.findUnique({
            where: { idempotencyKey },
          });
          if (ledger?.sendConfirmedAt && ledger.providerMessageId) {
            await prisma.whatsAppJob.update({
              where: { id: job.id },
              data: {
                status: "done",
                completedAt: new Date(),
                failedReason: null,
                claimedAt: null,
                leaseExpiresAt: null,
                claimedBy: null,
                payload: mergeSendMetaIntoPayload(job.payload, {
                  messageId: ledger.providerMessageId,
                }) as Prisma.InputJsonValue,
              },
            });
            results.push({ jobId: job.id, jobType: job.jobType, ok: true });
            continue;
          }
        } catch (ledgerErr) {
          const msg = ledgerErr instanceof Error ? ledgerErr.message : "";
          if (!/does not exist|P2021|Unknown arg/i.test(msg)) throw ledgerErr;
        }
      }

      const sendMeta = await withJobTimeout(executeJob(job, sendContext), job.id, job.jobType);

      if (idempotencyKey && sendMeta.messageId) {
        try {
          await markWhatsAppProviderSendConfirmed({
            idempotencyKey,
            providerMessageId: sendMeta.messageId,
          });
        } catch {
          /* ledger optional until migration */
        }
      }

      await prisma.whatsAppJob.update({
        where: { id: job.id },
        data: {
          status: "done",
          ...(sendMeta.messageId ? { completedAt: new Date() } : {}),
          failedReason: null,
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          payload: mergeSendMetaIntoPayload(job.payload, {
            phone: sendMeta.phone,
            messageId: sendMeta.messageId,
            sendStage: "PROVIDER_CONFIRMED",
            renderer: sendMeta.renderer,
            premiumFailureCategory: sendMeta.premiumFailureCategory,
            premiumRenderError: sendMeta.premiumRenderError,
          }) as Prisma.InputJsonValue,
        },
      });
      results.push({ jobId: job.id, jobType: job.jobType, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Job failed";
      let ledger: {
        sendStartedAt?: Date | null;
        sendConfirmedAt?: Date | null;
        providerMessageId?: string | null;
      } | null = null;

      if (idempotencyKey) {
        try {
          ledger = await prisma.whatsAppSendLedger.findUnique({
            where: { idempotencyKey },
          });
          if (ledger?.sendConfirmedAt && ledger.providerMessageId) {
            await prisma.whatsAppJob.update({
              where: { id: job.id },
              data: {
                status: "done",
                completedAt: new Date(),
                failedReason: null,
                claimedAt: null,
                leaseExpiresAt: null,
                claimedBy: null,
                payload: mergeSendMetaIntoPayload(job.payload, {
                  messageId: ledger.providerMessageId,
                }) as Prisma.InputJsonValue,
              },
            });
            results.push({ jobId: job.id, jobType: job.jobType, ok: true });
            continue;
          }
        } catch {
          /* ledger optional */
        }
      }

      const providerOutcome = providerOutcomeForFailure(error, ledger);
      const renderFailure = isPremiumSlipRenderFailureMessage(error);
      const renderRetryable = renderFailure && isPremiumRenderFailureRetryable(error);
      const providerUnknown = providerOutcome === "UNKNOWN";
      const attempts = job.attempts;
      const effectiveMax = renderRetryable ? Math.max(job.maxAttempts, 5) : job.maxAttempts;
      const terminal = providerUnknown || attempts >= effectiveMax;

      const retryDelay =
        renderRetryable && !terminal
          ? new Date(Date.now() + premiumRenderRetryDelayMs(attempts))
          : undefined;

      await prisma.whatsAppJob.update({
        where: { id: job.id },
        data: {
          status: terminal ? "failed" : "pending",
          failedReason: formatJobFailedReason(error, ledger),
          completedAt: null,
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          ...(retryDelay ? { scheduledAt: retryDelay } : {}),
          payload: mergeSendMetaIntoPayload(job.payload, {
            providerOutcome,
            sendStage: sendStageForFailure(error, ledger),
            ...(renderFailure ? { errorCode: PREMIUM_SLIP_RENDER_FAILED } : {}),
          }) as Prisma.InputJsonValue,
        },
      });
      results.push({ jobId: job.id, jobType: job.jobType, ok: false, error });
    }
  }

  return {
    processed: jobs.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export type RetryWhatsAppJobOptions = {
  /** Reset job attempts so exhausted render failures can run again. */
  resetAttempts?: boolean;
  /** Count one owner-initiated safe render retry (max 1). */
  incrementSafeRenderRetry?: boolean;
};

/** Owner-guarded retry that inspects send stage and ledger before requeueing. */
export async function retryWhatsAppJobSafely(
  jobId: number,
  ownerId: number,
  options?: RetryWhatsAppJobOptions,
) {
  const job = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sendStage = typeof payload.sendStage === "string" ? payload.sendStage : null;
  if (sendStage === "PROVIDER_OUTCOME_UNKNOWN" || isProviderOutcomeUnknownReason(job.failedReason)) {
    throw new Error(
      "Provider outcome unknown — reconcile using Mark as delivered / Mark as not delivered before resending.",
    );
  }

  let ledger: { sendConfirmedAt?: Date | null; providerMessageId?: string | null } | null = null;
  const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : null;
  if (idempotencyKey) {
    try {
      ledger = await prisma.whatsAppSendLedger.findUnique({ where: { idempotencyKey } });
    } catch {
      /* ledger optional */
    }
  }
  if (ledger?.sendConfirmedAt || ledger?.providerMessageId) {
    throw new Error("Provider send was confirmed — will not resend.");
  }

  const safety = canSafelyRetryWhatsAppJob({
    status: job.status,
    failedReason: job.failedReason,
    payload: job.payload,
    allowSafeRenderRetry: options?.incrementSafeRenderRetry,
  });
  if (!safety.ok) throw new Error(safety.reason);

  const retried = await retryWhatsAppJob(jobId, options);
  await prisma.whatsAppJob.update({
    where: { id: jobId },
    data: {
      payload: mergeSendMetaIntoPayload(retried.payload, {
        lastRetriedBy: ownerId,
        lastRetriedAt: new Date().toISOString(),
      }) as Prisma.InputJsonValue,
    },
  });
  return prisma.whatsAppJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function retryWhatsAppJob(jobId: number, options?: RetryWhatsAppJobOptions) {
  const job = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");

  const safety = canSafelyRetryWhatsAppJob({
    status: job.status,
    failedReason: job.failedReason,
    payload: job.payload,
    allowSafeRenderRetry: options?.incrementSafeRenderRetry,
  });
  if (!safety.ok) throw new Error(safety.reason);

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const safeRenderRetryCount =
    typeof payload.safeRenderRetryCount === "number" ? payload.safeRenderRetryCount : 0;
  const nextPayload = {
    ...payload,
    ...(options?.incrementSafeRenderRetry
      ? { safeRenderRetryCount: safeRenderRetryCount + 1 }
      : {}),
  };

  const updated = await prisma.whatsAppJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["failed", "processing"] },
    },
    data: {
      status: "pending",
      scheduledAt: new Date(),
      failedReason: null,
      completedAt: null,
      claimedAt: null,
      leaseExpiresAt: null,
      claimedBy: null,
      ...(options?.resetAttempts ? { attempts: 0 } : {}),
      payload: nextPayload as Prisma.InputJsonValue,
    },
  });
  if (updated.count !== 1) {
    throw new Error("Job is already queued or cannot be retried");
  }

  return prisma.whatsAppJob.findUniqueOrThrow({ where: { id: jobId } });
}

/** Owner bulk action: requeue render/infrastructure failures that never reached Meta. */
export async function retrySafeRenderFailureJobs(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<SafeRenderRetrySummary> {
  const classified = await listClassifiedWhatsAppRenderFailures(options?.limit ?? 500);
  const requeued: SafeRenderRetrySummary["requeued"] = [];
  const withheld: SafeRenderRetrySummary["withheld"] = [];

  for (const row of classified) {
    if (!row.safeToRequeue) {
      withheld.push(row);
      continue;
    }
    if (!options?.dryRun) {
      await retryWhatsAppJob(row.jobId, {
        resetAttempts: true,
        incrementSafeRenderRetry: true,
      });
    }
    requeued.push(row);
  }

  return {
    dryRun: Boolean(options?.dryRun),
    scanned: classified.length,
    requeued,
    withheld,
  };
}

export { getWhatsAppRenderFailureReport } from "./whatsappJobClassification";

export async function resetLateReminderOnDateChange(bookingId: number) {
  await cancelPendingJobs(bookingId, "booking_reminder");
  await prisma.booking.update({
    where: { id: bookingId },
    data: { lateReminderSentAt: null },
  });
}
