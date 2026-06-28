import prisma from "@/lib/prisma";
import { formatDate, parseDate } from "@/lib/constants";
import {
  sendBookingBillWhatsApp,
  sendBookingReminderWhatsApp,
  sendPostponementNoticeWhatsApp,
  sendReturnReceiptWhatsApp,
  sendDeliverySlipWhatsApp,
  sendPartialReturnSlipWhatsApp,
  sendIncompleteSlipWhatsApp,
} from "./automatedMessages";

export type WhatsAppJobType =
  | "booking_reminder"
  | "postponement_notice"
  | "booking_bill"
  | "return_receipt"
  | "delivery_slip"
  | "return_slip"
  | "incomplete_slip"
  | "custom_template";

type JobPayload = Record<string, unknown>;

/** 10:00 AM IST on the day before return = 04:30 UTC same calendar day as (returnDate - 1). */
export function reminderScheduledAt(returnDate: Date): Date {
  const d = new Date(returnDate);
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(4, 30, 0, 0);
  return d;
}

async function cancelPendingJobs(bookingId: number, jobType: WhatsAppJobType) {
  await prisma.whatsAppJob.updateMany({
    where: { bookingId, jobType, status: "pending" },
    data: { status: "cancelled" },
  });
}

export async function scheduleBookingReminder(
  bookingId: number,
  returnDate: Date | string,
  createdBy?: string,
) {
  const rd = typeof returnDate === "string" ? parseDate(returnDate.slice(0, 10)) : returnDate;
  const scheduledAt = reminderScheduledAt(rd);
  if (scheduledAt.getTime() <= Date.now()) return null;

  await cancelPendingJobs(bookingId, "booking_reminder");

  return prisma.whatsAppJob.create({
    data: {
      jobType: "booking_reminder",
      bookingId,
      scheduledAt,
      createdBy: createdBy ?? null,
      payload: { returnDate: formatDate(rd, "iso") },
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
  await cancelPendingJobs(bookingId, "booking_bill");

  return prisma.whatsAppJob.create({
    data: {
      jobType: "booking_bill",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: { requestOrigin: requestOrigin ?? null },
    },
  });
}

export async function scheduleReturnReceipt(
  bookingId: number,
  requestOrigin?: string,
  createdBy?: string,
) {
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
  payload: { scope: "full" | "single" | "combined"; bookingItemId?: number },
  requestOrigin?: string,
  createdBy?: string,
) {
  return prisma.whatsAppJob.create({
    data: {
      jobType: "delivery_slip",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: { ...payload, requestOrigin: requestOrigin ?? null },
    },
  });
}

export async function scheduleReturnSlip(
  bookingId: number,
  payload: { scope: "full" | "single" | "combined"; bookingItemId?: number },
  requestOrigin?: string,
  createdBy?: string,
) {
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
  requestOrigin?: string,
  createdBy?: string,
) {
  return prisma.whatsAppJob.create({
    data: {
      jobType: "incomplete_slip",
      bookingId,
      scheduledAt: new Date(),
      createdBy: createdBy ?? null,
      payload: { requestOrigin: requestOrigin ?? null },
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
}) {
  if (!job.bookingId) throw new Error("Job missing bookingId");

  const payload = (job.payload ?? {}) as JobPayload;

  switch (job.jobType as WhatsAppJobType) {
    case "booking_bill": {
      const result = await sendBookingBillWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
      );
      if (!result.ok && !result.skipped) throw new Error(result.error || "Booking bill send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "booking_reminder": {
      const result = await sendBookingReminderWhatsApp(job.bookingId);
      if (!result.ok && !result.skipped) throw new Error(result.error || "Reminder send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "postponement_notice": {
      const result = await sendPostponementNoticeWhatsApp(job.bookingId, {
        oldDeliveryDate: String(payload.oldDeliveryDate || ""),
        newDeliveryDate: String(payload.newDeliveryDate || ""),
        newReturnDate: String(payload.newReturnDate || ""),
        reason: typeof payload.reason === "string" ? payload.reason : undefined,
      });
      if (!result.ok && !result.skipped) throw new Error(result.error || "Postponement notice failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "return_receipt": {
      const result = await sendReturnReceiptWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
      );
      if (!result.ok && !result.skipped) throw new Error(result.error || "Return receipt send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "delivery_slip": {
      const scope = payload.scope as "full" | "single" | "combined";
      const result = await sendDeliverySlipWhatsApp(
        job.bookingId,
        {
          scope: scope || "full",
          bookingItemId:
            typeof payload.bookingItemId === "number" ? payload.bookingItemId : undefined,
        },
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
      );
      if (!result.ok && !result.skipped) throw new Error(result.error || "Delivery slip send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "return_slip": {
      const scope = payload.scope as "full" | "single" | "combined";
      const result = await sendPartialReturnSlipWhatsApp(
        job.bookingId,
        {
          scope: scope || "combined",
          bookingItemId:
            typeof payload.bookingItemId === "number" ? payload.bookingItemId : undefined,
        },
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
      );
      if (!result.ok && !result.skipped) throw new Error(result.error || "Return slip send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    case "incomplete_slip": {
      const result = await sendIncompleteSlipWhatsApp(
        job.bookingId,
        typeof payload.requestOrigin === "string" ? payload.requestOrigin : undefined,
      );
      if (!result.ok && !result.skipped) throw new Error(result.error || "Incomplete slip send failed");
      if (result.skipped) throw new Error(result.error || "WhatsApp not configured");
      break;
    }
    default:
      throw new Error(`Unsupported job type: ${job.jobType}`);
  }
}

export async function processWhatsAppJobQueue(limit = 20) {
  const now = new Date();
  const jobs = await prisma.whatsAppJob.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: now },
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  const results: Array<{
    jobId: number;
    jobType: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const job of jobs) {
    await prisma.whatsAppJob.update({
      where: { id: job.id },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        lastAttemptAt: now,
      },
    });

    try {
      await executeJob(job);
      await prisma.whatsAppJob.update({
        where: { id: job.id },
        data: { status: "done", completedAt: new Date(), failedReason: null },
      });
      results.push({ jobId: job.id, jobType: job.jobType, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Job failed";
      const attempts = job.attempts + 1;
      const failed = attempts >= job.maxAttempts;
      await prisma.whatsAppJob.update({
        where: { id: job.id },
        data: {
          status: failed ? "failed" : "pending",
          failedReason: error,
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
  if (job.status !== "failed") throw new Error("Only failed jobs can be retried");

  return prisma.whatsAppJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      scheduledAt: new Date(),
      failedReason: null,
      completedAt: null,
    },
  });
}

export async function rescheduleBookingReminderAfterDateChange(
  bookingId: number,
  returnDate: Date | string,
  createdBy?: string,
) {
  await cancelPendingJobs(bookingId, "booking_reminder");
  return scheduleBookingReminder(bookingId, returnDate, createdBy);
}
