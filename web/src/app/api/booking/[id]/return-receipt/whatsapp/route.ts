import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleReturnReceipt, processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppConfigured, isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return jsonError("Booking not found", 404);

  if (booking.status !== "returned") {
    return jsonError("Return receipt WhatsApp is only for fully returned bookings", 400);
  }

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return jsonError("No WhatsApp number on this booking");

  if (isWhatsAppReceiptsDisabled()) {
    return jsonOk({
      ok: true,
      delivered: false,
      paused: true,
      message: "WhatsApp receipts are temporarily paused (WHATSAPP_RECEIPTS_DISABLED).",
    });
  }

  if (!isWhatsAppConfigured()) {
    const publicId = resolvePublicBookingId(booking);
    const message = `Your return receipt (${publicId}) will be sent once WhatsApp API is configured.`;
    return jsonOk({
      ok: true,
      delivered: false,
      via: "manual",
      whatsappUrl: buildWhatsAppUrl(phoneRaw, message),
      message,
    });
  }

  const job = await scheduleReturnReceipt(bookingId, req.nextUrl.origin, user.username);
  let queueSummary;
  try {
    queueSummary = await processWhatsAppJobQueue(3, { bookingId });
  } catch (e) {
    console.error("[return-receipt whatsapp POST] queue error:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to send return receipt");
  }

  const sent = (queueSummary?.succeeded ?? 0) > 0;
  return jsonOk({
    ok: true,
    queued: true,
    sent,
    job_id: job?.id ?? null,
    message: sent
      ? "Return receipt sent to WhatsApp."
      : "Return receipt could not be sent — check the job queue for errors.",
  });
}
