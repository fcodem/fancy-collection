import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrScanUrl } from "@/lib/bookingQr";
import {
  bookingConfirmationTemplateParams,
  buildBookingConfirmationMessage,
  deliverWhatsApp,
  buildWhatsAppUrl,
} from "@/lib/whatsapp";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

async function buildBookingWhatsAppPayload(bookingId: number, origin: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return null;

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return { error: "No WhatsApp number on this booking" as const };
  const phone = phoneRaw.trim();

  const qrToken = await ensureBookingQrToken(booking.id);
  const qrUrl = bookingQrScanUrl(qrToken, origin);
  const billUrl = `${origin}/booking/${booking.id}/print`;

  const dressNames = booking.bookingItems.length
    ? booking.bookingItems.map((bi) =>
        dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size)
      )
    : booking.dressName
      ? [booking.dressName]
      : [];

  const messageOpts = {
    customerName: booking.customerName,
    serialNo: booking.monthlySerial,
    deliveryDate: formatDate(booking.deliveryDate, "display"),
    deliveryTime: booking.deliveryTime,
    returnDate: formatDate(booking.returnDate, "display"),
    returnTime: booking.returnTime,
    venue: booking.venue || undefined,
    totalRent: booking.totalPrice,
    advancePaid: booking.totalAdvance,
    remaining: booking.totalRemaining,
    dressNames,
    qrUrl,
    billUrl,
  };

  return {
    booking,
    phone,
    message: buildBookingConfirmationMessage(messageOpts),
    templateParams: bookingConfirmationTemplateParams({ ...messageOpts, billUrl }),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const payload = await buildBookingWhatsAppPayload(bookingId, req.nextUrl.origin);
  if (!payload) return jsonError("Booking not found", 404);
  if ("error" in payload) return jsonError("No WhatsApp number on this booking");

  const { phone, message, templateParams, booking } = payload;

  return jsonOk({
    message,
    whatsappUrl: buildWhatsAppUrl(phone, message),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const payload = await buildBookingWhatsAppPayload(bookingId, req.nextUrl.origin);
  if (!payload) return jsonError("Booking not found", 404);
  if ("error" in payload) return jsonError("No WhatsApp number on this booking");

  const { phone, message, templateParams, booking } = payload;

  const result = await deliverWhatsApp({
    phone,
    userName: booking.customerName,
    message,
    campaignType: "booking",
    templateParams,
    source: `booking-${bookingId}`,
  });

  if (result.delivered) {
    return jsonOk({
      ok: true,
      delivered: true,
      via: result.via,
      messageId: result.messageId,
      message: result.message,
    });
  }

  if (result.error) {
    return jsonError(result.error, 502);
  }

  return jsonOk({
    ok: true,
    delivered: false,
    via: result.via,
    whatsappUrl: result.whatsappUrl,
    message: result.message,
  });
}
