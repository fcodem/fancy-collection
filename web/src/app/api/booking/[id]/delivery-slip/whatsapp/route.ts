import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleDeliverySlip } from "@/lib/services/whatsapp/jobQueue";
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

  after(async () => {
    try {
      const { processWhatsAppJobQueue } = await import("@/lib/services/whatsapp/jobQueue");
      await processWhatsAppJobQueue(3, { bookingId });
    } catch (e) {
      console.error("[delivery-slip whatsapp POST] after-drain failed:", e);
    }
  });

  return jsonOk({
    ok: true,
    queued: true,
    sent: false,
    job_id: job?.id ?? null,
    message: "Delivery slip queued — WhatsApp is sending in the background.",
  });
}
