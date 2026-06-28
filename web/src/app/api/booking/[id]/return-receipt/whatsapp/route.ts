import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { scheduleReturnReceipt } from "@/lib/services/whatsapp/jobQueue";
import { isWhatsAppConfigured } from "@/lib/services/whatsapp/metaApi";
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

  return jsonOk({
    ok: true,
    queued: true,
    job_id: job?.id ?? null,
    message: "Return receipt WhatsApp queued for delivery.",
  });
}
