import prisma from "@/lib/prisma";
import type { WhatsAppJob } from "@prisma/client";

type JobPayload = Record<string, unknown>;

export type JobSendMeta = {
  sentPhone?: string;
  metaMessageId?: string;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  contact1?: string | null;
  whatsappNo?: string | null;
};

function payloadOf(job: WhatsAppJob): JobPayload {
  return (job.payload ?? {}) as JobPayload;
}

/** Attach send phone, Meta message id, and webhook delivery status to queue jobs. */
export async function enrichWhatsAppJobs(
  jobs: Array<
    WhatsAppJob & {
      booking?: {
        id: number;
        monthlySerial: number;
        publicBookingId: string | null;
        customerName: string;
        contact1: string | null;
        whatsappNo: string | null;
      } | null;
    }
  >,
): Promise<Map<number, JobSendMeta>> {
  const metaIds = new Set<string>();
  const bookingIdsNeedingLookup: number[] = [];

  for (const job of jobs) {
    const p = payloadOf(job);
    const mid = typeof p.metaMessageId === "string" ? p.metaMessageId : undefined;
    if (mid) metaIds.add(mid);
    else if (job.status === "done" && job.bookingId && job.completedAt) {
      bookingIdsNeedingLookup.push(job.bookingId);
    }
  }

  const messagesByMetaId = new Map<
    string,
    {
      deliveryStatus: string | null;
      error: string | null;
      deliveredAt: Date | null;
      readAt: Date | null;
      phone: string | null;
    }
  >();

  if (metaIds.size > 0) {
    const rows = await prisma.whatsAppMessage.findMany({
      where: { metaMessageId: { in: [...metaIds] } },
      select: {
        metaMessageId: true,
        deliveryStatus: true,
        error: true,
        deliveredAt: true,
        readAt: true,
        phone: true,
      },
    });
    for (const row of rows) {
      if (row.metaMessageId) messagesByMetaId.set(row.metaMessageId, row);
    }
  }

  const fallbackByBooking = new Map<
    number,
    { metaMessageId: string | null; phone: string | null; deliveryStatus: string | null; error: string | null; deliveredAt: Date | null; readAt: Date | null }
  >();

  if (bookingIdsNeedingLookup.length > 0) {
    const outbound = await prisma.whatsAppMessage.findMany({
      where: {
        bookingId: { in: [...new Set(bookingIdsNeedingLookup)] },
        direction: "outbound",
      },
      orderBy: { createdAt: "desc" },
      select: {
        bookingId: true,
        metaMessageId: true,
        phone: true,
        deliveryStatus: true,
        error: true,
        deliveredAt: true,
        readAt: true,
        createdAt: true,
      },
    });

    for (const job of jobs) {
      if (!job.bookingId || !job.completedAt) continue;
      const p = payloadOf(job);
      if (typeof p.metaMessageId === "string") continue;

      const match = outbound.find(
        (m) =>
          m.bookingId === job.bookingId &&
          m.createdAt >= new Date(job.completedAt!.getTime() - 120_000) &&
          m.createdAt <= new Date(job.completedAt!.getTime() + 30_000),
      );
      if (match && !fallbackByBooking.has(job.bookingId)) {
        fallbackByBooking.set(job.bookingId, match);
        if (match.metaMessageId) metaIds.add(match.metaMessageId);
      }
    }

    for (const [bid, match] of fallbackByBooking) {
      if (match.metaMessageId && !messagesByMetaId.has(match.metaMessageId)) {
        messagesByMetaId.set(match.metaMessageId, match);
      }
      void bid;
    }
  }

  const result = new Map<number, JobSendMeta>();

  for (const job of jobs) {
    const p = payloadOf(job);
    let metaMessageId =
      typeof p.metaMessageId === "string"
        ? p.metaMessageId
        : undefined;
    let sentPhone =
      typeof p.sentPhone === "string"
        ? p.sentPhone
        : undefined;

    if (!metaMessageId && job.bookingId) {
      const fb = fallbackByBooking.get(job.bookingId);
      if (fb) {
        metaMessageId = fb.metaMessageId ?? undefined;
        sentPhone = sentPhone ?? fb.phone ?? undefined;
      }
    }

    const msg = metaMessageId ? messagesByMetaId.get(metaMessageId) : undefined;
    if (!sentPhone && msg?.phone) sentPhone = msg.phone;

    result.set(job.id, {
      sentPhone,
      metaMessageId,
      deliveryStatus: msg?.deliveryStatus ?? null,
      deliveryError: msg?.error ?? null,
      deliveredAt: msg?.deliveredAt?.toISOString() ?? null,
      readAt: msg?.readAt?.toISOString() ?? null,
      contact1: job.booking?.contact1 ?? null,
      whatsappNo: job.booking?.whatsappNo ?? null,
    });
  }

  return result;
}

export function mergeSendMetaIntoPayload(
  existing: unknown,
  meta: {
    phone?: string;
    messageId?: string;
    providerOutcome?: string;
    errorCode?: string;
    sendStage?: string;
    reconciledBy?: number;
    reconciledAt?: string;
    forceResendApprovedBy?: number;
    forceResendApprovedAt?: string;
    idempotencyVersion?: number;
    idempotencyKey?: string;
    lastRetriedBy?: number;
    lastRetriedAt?: string;
    renderer?: string;
    premiumFailureCategory?: string;
    premiumRenderError?: string;
  },
): JobPayload {
  const base = (existing ?? {}) as JobPayload;
  return {
    ...base,
    ...(meta.phone ? { sentPhone: meta.phone } : {}),
    ...(meta.messageId ? { metaMessageId: meta.messageId } : {}),
    ...(meta.providerOutcome ? { providerOutcome: meta.providerOutcome } : {}),
    ...(meta.errorCode ? { errorCode: meta.errorCode } : {}),
    ...(meta.sendStage ? { sendStage: meta.sendStage } : {}),
    ...(meta.reconciledBy != null ? { reconciledBy: meta.reconciledBy } : {}),
    ...(meta.reconciledAt ? { reconciledAt: meta.reconciledAt } : {}),
    ...(meta.forceResendApprovedBy != null
      ? { forceResendApprovedBy: meta.forceResendApprovedBy }
      : {}),
    ...(meta.forceResendApprovedAt ? { forceResendApprovedAt: meta.forceResendApprovedAt } : {}),
    ...(meta.idempotencyVersion != null ? { idempotencyVersion: meta.idempotencyVersion } : {}),
    ...(meta.idempotencyKey ? { idempotencyKey: meta.idempotencyKey } : {}),
    ...(meta.lastRetriedBy != null ? { lastRetriedBy: meta.lastRetriedBy } : {}),
    ...(meta.lastRetriedAt ? { lastRetriedAt: meta.lastRetriedAt } : {}),
    ...(meta.renderer ? { renderer: meta.renderer } : {}),
    ...(meta.premiumFailureCategory ? { premiumFailureCategory: meta.premiumFailureCategory } : {}),
    ...(meta.premiumRenderError ? { premiumRenderError: meta.premiumRenderError } : {}),
  };
}
