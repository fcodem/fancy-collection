import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { runBookingWhatsAppFlow } from "@/lib/services/bookingWhatsAppFlow";
import { formatAisensyPhone } from "@/lib/services/aisensy.service";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking id", 400);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      customerName: true,
      whatsappNo: true,
      contact1: true,
    },
  });
  if (!booking) return jsonError("Booking not found", 404);

  const phoneRaw = booking.whatsappNo?.trim() || booking.contact1?.trim() || "";
  if (!phoneRaw) return jsonError("No WhatsApp number on this booking", 400);

  const result = await runBookingWhatsAppFlow(bookingId, req.nextUrl.origin, { force: true });

  if (result.status === "sent") {
    return jsonOk({
      ok: true,
      delivered: true,
      phone: formatAisensyPhone(phoneRaw),
      customerName: booking.customerName,
    });
  }

  if (result.status === "skipped") {
    return jsonOk({
      ok: true,
      delivered: false,
      phone: formatAisensyPhone(phoneRaw),
      customerName: booking.customerName,
      error: result.error || "WhatsApp is not configured",
    });
  }

  return jsonError(result.error || "WhatsApp send failed", 502);
}
