import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleBookingBill } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppConfigured, isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate } from "@/lib/constants";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return jsonError("Booking not found", 404);

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return jsonError("No WhatsApp number on this booking");

  const publicId = resolvePublicBookingId(booking);
  const message =
    `Booking ${publicId} — ${booking.customerName}\n` +
    `Delivery: ${formatDate(booking.deliveryDate, "display")} ${booking.deliveryTime}\n` +
    `Return: ${formatDate(booking.returnDate, "display")} ${booking.returnTime}\n\n` +
    `Use Send WhatsApp to queue the booking slip PDF.`;

  return jsonOk({
    message,
    whatsappUrl: buildWhatsAppUrl(phoneRaw, message),
    whatsapp_status: booking.whatsappStatus,
    whatsapp_sent_at: booking.whatsappSentAt?.toISOString() ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return jsonError("Booking not found", 404);

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
    const message = `Your booking slip (${publicId}) will be sent once WhatsApp API is configured.`;
    return jsonOk({
      ok: true,
      delivered: false,
      via: "manual",
      whatsappUrl: buildWhatsAppUrl(phoneRaw, message),
      message,
    });
  }

  let resend = false;
  try {
    const body = await req.json();
    resend = body?.resend === true;
  } catch {
    // empty body — first send via job queue
  }

  // Queue only — never await Chromium/Meta on this request (matches create/delivery).
  const job = await scheduleBookingBill(bookingId, req.nextUrl.origin, user.username, {
    forceResend: resend,
  });

  after(async () => {
    try {
      const { processWhatsAppJobQueue } = await import("@/lib/services/whatsapp/jobQueue");
      await processWhatsAppJobQueue(3, { bookingId });
    } catch (e) {
      console.error("[booking whatsapp POST] after-drain failed:", e);
    }
  });

  return jsonOk({
    ok: true,
    queued: true,
    delivered: false,
    resent: resend,
    job_id: job?.id ?? null,
    message: resend
      ? "Booking slip resend queued — WhatsApp is sending in the background."
      : "Booking slip queued — WhatsApp is sending in the background.",
  });
}
