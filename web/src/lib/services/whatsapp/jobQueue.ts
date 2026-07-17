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
  result: { ok: boolean; skipped?: boolean; error?: string; phone?: string; messageId?: string },
  fallbackError: string,
): { phone?: string; messageId?: string } {
  if (result.ok) {
    return { phone: result.phone, messageId: result.messageId };
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

/** Canonical active statuses for idempotency short-circuit (worker writes `done`). */
const ACTIVE_WA_JOB_STATUSES = ["pending", "processing", "done"] as const;

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
                  j.payload, j.attempts, j.max_attempts AS "maxAttempts"
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
                j.payload, j.attempts, j.max_attempts AS "maxAttempts"
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

export async function scheduleBookingBill(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  await cancelPendingJobs(bookingId, "booking_bill");

  const createLegacy = () =>
    prisma.whatsAppJob.create({
      data: {
        jobType: "booking_bill",
        bookingId,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: { requestOrigin: requestOrigin ?? null },
      },
    });

  try {
    const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
    const idempotencyKey = buildWhatsAppIdempotencyKey("booking_bill", bookingId);
    const existing = await prisma.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...ACTIVE_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;

    return await prisma.whatsAppJob.create({
      data: {
        jobType: "booking_bill",
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: { requestOrigin: requestOrigin ?? null },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/idempotency|P2002|does not exist|Unknown arg/i.test(msg)) {
      try {
        const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
        const idempotencyKey = buildWhatsAppIdempotencyKey("booking_bill", bookingId);
        const raced = await prisma.whatsAppJob.findFirst({ where: { idempotencyKey } });
        if (raced) return raced;
      } catch {
        /* column may be absent until migration */
      }
      return createLegacy();
    }
    throw e;
  }
}

export async function scheduleReturnReceipt(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  await cancelPendingJobs(bookingId, "return_receipt");

  return prisma.whatsAppJob.create({
    data: {
      jobType: "return_receipt",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: { requestOrigin: requestOrigin ?? null },
    },
  });
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
) {
  if (isWhatsAppReceiptsDisabled()) return null;

  const itemIds =
    payload.bookingItemIds?.length
      ? payload.bookingItemIds
      : payload.bookingItemId
        ? [payload.bookingItemId]
        : [];

  const createLegacy = () =>
    prisma.whatsAppJob.create({
      data: {
        jobType: "delivery_slip",
        bookingId,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: { ...payload, requestOrigin: requestOrigin ?? null },
      },
    });

  try {
    const { buildWhatsAppIdempotencyKey } = await import("@/lib/mutationIdempotency");
    const idempotencyKey = buildWhatsAppIdempotencyKey(
      "delivery_slip",
      bookingId,
      itemIds,
      payload.scope,
    );
    const existing = await prisma.whatsAppJob.findFirst({
      where: { idempotencyKey, status: { in: [...ACTIVE_WA_JOB_STATUSES] } },
    });
    if (existing) return existing;

    return await prisma.whatsAppJob.create({
      data: {
        jobType: "delivery_slip",
        bookingId,
        idempotencyKey,
        scheduledAt: new Date(),
        createdBy: createdBy ?? null,
        payload: { ...payload, requestOrigin: requestOrigin ?? null },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/idempotency|P2002|does not exist|Unknown arg/i.test(msg)) {
      return createLegacy();
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
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  return prisma.whatsAppJob.create({
    data: {
      jobType: "return_slip",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: { ...payload, requestOrigin: requestOrigin ?? null },
    },
  });
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
) {
  if (isWhatsAppReceiptsDisabled()) return null;
  return prisma.whatsAppJob.create({
    data: {
      jobType: "incomplete_slip",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: {
        scope: payload.scope,
        bookingItemId: payload.bookingItemId ?? null,
        bookingItemIds: payload.bookingItemIds ?? [],
        requestOrigin: requestOrigin ?? null,
      },
    },
  });
}

async function executeJob(job: {
  id: number;
  jobType: string;
  bookingId: number | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}): Promise<{ phone?: string; messageId?: string }> {
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
      );
      return outcomeFromSend(result, "Booking bill send failed");
    }
    case "postponement_held": {
      const result = await sendPostponementHeldWhatsApp(job.bookingId);
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
      });
      return outcomeFromSend(result, "Postponement notice failed");
    }
    case "return_receipt": {
      const result = await sendReturnReceiptWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
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
      );
      return outcomeFromSend(result, "Incomplete slip send failed");
    }
    default:
      throw new Error(`Unsupported job type: ${job.jobType}`);
  }
}

export async function processWhatsAppJobQueue(
  limit = 20,
  options?: { bookingId?: number },
) {
  await recoverStuckWhatsAppJobs();

  const jobs = await claimPendingWhatsAppJobs(limit, options);

  const results: Array<{
    jobId: number;
    jobType: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const job of jobs) {
    try {
      const sendMeta = await withJobTimeout(executeJob(job), job.id, job.jobType);
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
            phone: sendMeta.phone,
            messageId: sendMeta.messageId,
          }) as Prisma.InputJsonValue,
        },
      });
      results.push({ jobId: job.id, jobType: job.jobType, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Job failed";
      const attempts = job.attempts;
      const failed = attempts >= job.maxAttempts;
      await prisma.whatsAppJob.update({
        where: { id: job.id },
        data: {
          status: failed ? "failed" : "pending",
          failedReason: error,
          claimedAt: null,
          leaseExpiresAt: null,
          claimedBy: null,
          ...(failed ? { completedAt: new Date() } : {}),
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

export async function retryWhatsAppJob(jobId: number) {
  const job = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");
  if (job.status !== "failed" && job.status !== "processing") {
    throw new Error("Only failed or stuck jobs can be retried");
  }

  return prisma.whatsAppJob.update({    where: { id: jobId },
    data: {
      status: "pending",
      scheduledAt: new Date(),
      failedReason: null,
      completedAt: null,
    },
  });
}

export async function resetLateReminderOnDateChange(bookingId: number) {
  await cancelPendingJobs(bookingId, "booking_reminder");
  await prisma.booking.update({
    where: { id: bookingId },
    data: { lateReminderSentAt: null },
  });
}
