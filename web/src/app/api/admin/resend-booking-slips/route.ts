import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  processWhatsAppJobQueue,
  scheduleBookingBill,
  scheduleDeliverySlip,
  scheduleIncompleteSlip,
  scheduleReturnSlip,
} from "@/lib/services/whatsapp/jobQueue";

type SlipKind = "booking" | "delivery" | "return" | "incomplete";

/** Owner-only: resend slip PDF(s) via durable WA job queue (send ledger protected). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    const bookingId = parseInt(String(body.booking_id || ""), 10);
    if (!bookingId) return jsonError("booking_id required");

    const kinds: SlipKind[] = Array.isArray(body.kinds) && body.kinds.length
      ? body.kinds
      : ["incomplete"];

    const origin = req.nextUrl.origin;
    const results: Record<string, unknown> = {};
    const jobIds: number[] = [];

    if (kinds.includes("booking")) {
      const job = await scheduleBookingBill(bookingId, origin, user.username, {
        forceResend: true,
      });
      results.booking = { ok: Boolean(job?.id), job_id: job?.id ?? null };
      if (job?.id) jobIds.push(job.id);
    }

    if (kinds.includes("delivery")) {
      await prisma.bookingItem.updateMany({
        where: { bookingId, isDelivered: true },
        data: { deliverySlipNotifiedAt: null },
      });
      const deliveredIds = (
        await prisma.bookingItem.findMany({
          where: { bookingId, isDelivered: true, isCancelled: false },
          select: { id: true },
        })
      ).map((r) => r.id);
      const job = await scheduleDeliverySlip(
        bookingId,
        {
          scope: deliveredIds.length <= 1 ? "single" : "combined",
          bookingItemId: deliveredIds.length === 1 ? deliveredIds[0] : undefined,
          bookingItemIds: deliveredIds,
        },
        origin,
        user.username,
        { forceResend: true },
      );
      results.delivery = { ok: Boolean(job?.id), job_id: job?.id ?? null };
      if (job?.id) jobIds.push(job.id);
    }

    if (kinds.includes("return")) {
      await prisma.bookingItem.updateMany({
        where: { bookingId, isReturned: true, isIncompleteReturn: false },
        data: { returnSlipNotifiedAt: null },
      });
      const returnedIds = (
        await prisma.bookingItem.findMany({
          where: { bookingId, isReturned: true, isIncompleteReturn: false },
          select: { id: true },
        })
      ).map((r) => r.id);
      const scope =
        returnedIds.length <= 1 ? "single" : returnedIds.length > 1 ? "combined" : "full";
      const job = await scheduleReturnSlip(
        bookingId,
        {
          scope: returnedIds.length === 0 ? "full" : scope,
          bookingItemId: returnedIds.length === 1 ? returnedIds[0] : undefined,
          bookingItemIds: returnedIds,
        },
        origin,
        user.username,
        { forceResend: true },
      );
      results.return = { ok: Boolean(job?.id), job_id: job?.id ?? null };
      if (job?.id) jobIds.push(job.id);
    }

    if (kinds.includes("incomplete")) {
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
        results.incomplete = { ok: false, error: "No incomplete items on this booking" };
      } else {
        const scope = incompleteIds.length === 1 ? "single" : "combined";
        const job = await scheduleIncompleteSlip(
          bookingId,
          {
            scope,
            bookingItemId: incompleteIds.length === 1 ? incompleteIds[0] : undefined,
            bookingItemIds: incompleteIds,
          },
          origin,
          user.username,
          { forceResend: true },
        );
        results.incomplete = { ok: Boolean(job?.id), job_id: job?.id ?? null };
        if (job?.id) jobIds.push(job.id);
      }
    }

    let queueSummary: { succeeded?: number } | undefined;
    if (jobIds.length) {
      try {
        queueSummary = await processWhatsAppJobQueue(Math.min(jobIds.length + 1, 4), {
          bookingId,
        });
      } catch (e) {
        console.error("[admin resend-booking-slips] queue error:", e);
      }
    }

    const anyOk = Object.values(results).some(
      (r) => r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok,
    );

    return jsonOk({
      ok: anyOk,
      bookingId,
      results,
      queued: jobIds.length,
      processed: queueSummary?.succeeded ?? 0,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Resend failed", 500);
  }
}
