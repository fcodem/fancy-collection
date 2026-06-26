import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { runBookingWhatsAppFlow } from "@/lib/services/bookingWhatsAppFlow";
import {
  buildFullBookingConfirmationText,
  bookingConfirmationTemplateParams,
} from "@/lib/services/aisensy.service";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { ensureBookingQrToken, bookingQrScanUrl } from "@/lib/bookingQr";
import { resolveQrPublicUrl } from "@/lib/services/qrcode.service";
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
  const qrCodeUrl = resolveQrPublicUrl(booking.qrCodeUrl, origin) || undefined;

  const dressNames = booking.bookingItems.length
    ? booking.bookingItems.map((bi) =>
        dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size),
      )
    : booking.dressName
      ? [booking.dressName]
      : [];

  const messageOpts = {
    bookingId: booking.id,
    publicBookingId: booking.publicBookingId || `BK-${String(booking.id).padStart(6, "0")}`,
    phone,
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
    qrCodeUrl,
    billUrl,
  };

  return {
    booking,
    phone,
    message: buildFullBookingConfirmationText(messageOpts),
    templateParams: bookingConfirmationTemplateParams(messageOpts),
  };
}

/** Legacy preview endpoint — GET returns message text and wa.me link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const payload = await buildBookingWhatsAppPayload(bookingId, req.nextUrl.origin);
  if (!payload) return jsonError("Booking not found", 404);
  if ("error" in payload) return jsonError("No WhatsApp number on this booking");

  const { phone, message } = payload;

  return jsonOk({
    message,
    whatsappUrl: buildWhatsAppUrl(phone, message),
  });
}

/** Legacy send endpoint — delegates to full omni-channel flow. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const payload = await buildBookingWhatsAppPayload(bookingId, req.nextUrl.origin);
  if (!payload) return jsonError("Booking not found", 404);
  if ("error" in payload) return jsonError("No WhatsApp number on this booking");

  const result = await runBookingWhatsAppFlow(bookingId, req.nextUrl.origin, { force: true });

  if (result.status === "sent") {
    return jsonOk({
      ok: true,
      delivered: true,
      via: "aisensy",
      message: payload.message,
    });
  }

  if (result.status === "skipped") {
    return jsonOk({
      ok: true,
      delivered: false,
      via: "manual",
      whatsappUrl: buildWhatsAppUrl(payload.phone, payload.message),
      message: payload.message,
      error: result.error,
    });
  }

  return jsonError(result.error || "WhatsApp send failed", 502);
}
