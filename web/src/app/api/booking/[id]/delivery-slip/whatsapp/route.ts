import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleDeliverySlip, processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppConfigured, isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        where: { isDelivered: true },
        select: { id: true },
      },
    },
  });
  if (!booking) return jsonError("Booking not found", 404);

  const deliveredIds = booking.bookingItems.map((it) => it.id);
  if (deliveredIds.length === 0) {
    return jsonError("No delivered dresses on this booking — mark delivery first", 400);
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
    const message = `Your delivery slip (${publicId}) will be sent once WhatsApp API is configured.`;
    return jsonOk({
      ok: true,
      delivered: false,
      via: "manual",
      whatsappUrl: buildWhatsAppUrl(phoneRaw, message),
      message,
    });
  }

  // Allow resend from the slip page (clear prior notify flags for delivered items).
  await prisma.bookingItem.updateMany({
    where: { bookingId, isDelivered: true },
    data: { deliverySlipNotifiedAt: null },
  });

  const job = await scheduleDeliverySlip(
    bookingId,
    { scope: "full", bookingItemIds: deliveredIds },
    req.nextUrl.origin,
    user.username,
  );
  let queueSummary;
  try {
    queueSummary = await processWhatsAppJobQueue(3, { bookingId });
  } catch (e) {
    console.error("[delivery-slip whatsapp POST] queue error:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to send delivery slip");
  }

  const sent = (queueSummary?.succeeded ?? 0) > 0;
  return jsonOk({
    ok: true,
    queued: true,
    sent,
    job_id: job?.id ?? null,
    message: sent
      ? "Delivery slip sent to WhatsApp."
      : "Delivery slip queued — run the job queue if it was not sent.",
  });
}
