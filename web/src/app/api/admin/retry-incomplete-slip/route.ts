import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  processWhatsAppJobQueue,
  scheduleIncompleteSlip,
} from "@/lib/services/whatsapp/jobQueue";

/** Owner-only: resend incomplete slip via durable WA queue (send ledger protected). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    const bookingId = parseInt(String(body.booking_id || ""), 10);
    if (!bookingId) return jsonError("booking_id required");

    await prisma.bookingItem.updateMany({
      where: { bookingId, isIncompleteReturn: true },
      data: { returnSlipNotifiedAt: null },
    });

    const incompleteIds = (
      await prisma.bookingItem.findMany({
        where: { bookingId, isIncompleteReturn: true },
        select: { id: true },
      })
    ).map((r) => r.id);

    if (!incompleteIds.length) {
      return jsonError("No incomplete items on this booking", 400);
    }

    const job = await scheduleIncompleteSlip(
      bookingId,
      {
        scope: incompleteIds.length === 1 ? "single" : "combined",
        bookingItemId: incompleteIds.length === 1 ? incompleteIds[0] : undefined,
        bookingItemIds: incompleteIds,
      },
      req.nextUrl.origin,
      user.username,
      { forceResend: true },
    );

    let queueSummary;
    try {
      queueSummary = await processWhatsAppJobQueue(2, { bookingId });
    } catch (e) {
      console.error("[admin retry-incomplete-slip] queue error:", e);
    }

    return jsonOk({
      ok: Boolean(job?.id),
      job_id: job?.id ?? null,
      processed: queueSummary?.succeeded ?? 0,
      delivered: Boolean(queueSummary?.succeeded),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Retry failed", 500);
  }
}
