import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { enrichWhatsAppJobs } from "@/lib/services/whatsapp/jobSendMeta";
import { normalizeIndianPhone } from "@/lib/phone";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const bookingId = parseInt(req.nextUrl.searchParams.get("bookingId") || "0", 10);
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50", 10), 200);

  const jobs = await prisma.whatsAppJob.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(bookingId > 0 ? { bookingId } : {}),
    },
    include: {
      booking: {
        select: {
          id: true,
          monthlySerial: true,
          publicBookingId: true,
          customerName: true,
          contact1: true,
          whatsappNo: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  const sendMeta = await enrichWhatsAppJobs(jobs);

  return jsonOk({
    jobs: jobs.map((j) => {
      const meta = sendMeta.get(j.id);
      const sentNormalized = meta?.sentPhone ? normalizeIndianPhone(meta.sentPhone) : null;
      const contactNormalized = meta?.contact1 ? normalizeIndianPhone(meta.contact1) : null;
      const whatsappNormalized = meta?.whatsappNo ? normalizeIndianPhone(meta.whatsappNo) : null;
      const phoneMismatch = Boolean(
        whatsappNormalized &&
        contactNormalized &&
        whatsappNormalized !== contactNormalized &&
        sentNormalized === whatsappNormalized,
      );

      return {
        id: j.id,
        job_type: j.jobType,
        booking_id: j.bookingId,
        payload: j.payload,
        scheduled_at: j.scheduledAt.toISOString(),
        status: j.status,
        attempts: j.attempts,
        max_attempts: j.maxAttempts,
        last_attempt_at: j.lastAttemptAt?.toISOString() ?? null,
        completed_at: j.completedAt?.toISOString() ?? null,
        failed_reason: j.failedReason,
        created_at: j.createdAt.toISOString(),
        created_by: j.createdBy,
        sent_phone: meta?.sentPhone ?? null,
        meta_message_id: meta?.metaMessageId ?? null,
        delivery_status: meta?.deliveryStatus ?? null,
        delivery_error: meta?.deliveryError ?? null,
        delivered_at: meta?.deliveredAt ?? null,
        read_at: meta?.readAt ?? null,
        booking_contact1: meta?.contact1 ?? null,
        booking_whatsapp_no: meta?.whatsappNo ?? null,
        phone_mismatch: Boolean(phoneMismatch),
        booking: j.booking
          ? {
              id: j.booking.id,
              serial: j.booking.monthlySerial,
              public_booking_id: j.booking.publicBookingId,
              customer_name: j.booking.customerName,
            }
          : null,
      };
    }),
  });
}

/** Delete jobs — all, by status filter, or specific ids. */
export async function DELETE(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  let body: { status?: string; ids?: number[]; all?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body");
  }

  const status = body.status?.trim() || undefined;
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => parseInt(String(id), 10)).filter((id) => id > 0)
    : undefined;

  if (!body.all && (!ids || ids.length === 0) && !status) {
    return jsonError("Provide all: true, status, or ids to delete");
  }

  const where =
    body.all && !status && (!ids || ids.length === 0)
      ? {}
      : {
          ...(status ? { status } : {}),
          ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
        };

  const result = await prisma.whatsAppJob.deleteMany({ where });

  return jsonOk({ ok: true, deleted: result.count });
}
