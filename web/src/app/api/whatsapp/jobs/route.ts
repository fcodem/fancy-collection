import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

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
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return jsonOk({
    jobs: jobs.map((j) => ({
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
      booking: j.booking
        ? {
            id: j.booking.id,
            serial: j.booking.monthlySerial,
            public_booking_id: j.booking.publicBookingId,
            customer_name: j.booking.customerName,
          }
        : null,
    })),
  });
}
