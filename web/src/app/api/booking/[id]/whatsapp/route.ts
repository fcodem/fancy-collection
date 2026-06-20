import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrScanUrl } from "@/lib/bookingQr";
import { buildBookingConfirmationMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return jsonError("Booking not found", 404);

  const phone = booking.whatsappNo || booking.contact1;
  if (!phone?.trim()) return jsonError("No WhatsApp number on this booking");

  const qrToken = await ensureBookingQrToken(booking.id);
  const origin = req.nextUrl.origin;
  const qrUrl = bookingQrScanUrl(qrToken, origin);
  const billUrl = `${origin}/booking/${booking.id}/print`;

  const dressNames = booking.bookingItems.length
    ? booking.bookingItems.map((bi) =>
        dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size)
      )
    : booking.dressName
      ? [booking.dressName]
      : [];

  const message = buildBookingConfirmationMessage({
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
  });

  return jsonOk({ whatsappUrl: buildWhatsAppUrl(phone, message), message });
}
