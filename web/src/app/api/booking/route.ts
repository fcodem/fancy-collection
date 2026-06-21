import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { createBooking } from "@/lib/services/bookingCrud";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { ensureBookingQrToken, bookingQrScanUrl } from "@/lib/bookingQr";
import {
  bookingConfirmationTemplateParams,
  buildBookingConfirmationMessage,
  deliverWhatsApp,
} from "@/lib/whatsapp";
import { BookingFormSchema } from "@/lib/validation";

async function maybeAutoSendBookingWhatsApp(bookingId: number, origin: string) {
  if (process.env.AISENSY_AUTO_SEND_BOOKING !== "true") return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return;

  const phone = booking.whatsappNo || booking.contact1;
  if (!phone?.trim()) return;

  const qrToken = await ensureBookingQrToken(booking.id);
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
    dressNames: booking.bookingItems.length
      ? booking.bookingItems.map((bi) =>
          dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size)
        )
      : booking.dressName
        ? [booking.dressName]
        : [],
    qrUrl: bookingQrScanUrl(qrToken, origin),
    billUrl: `${origin}/booking/${booking.id}/print`,
  };

  await deliverWhatsApp({
    phone,
    userName: booking.customerName,
    message: buildBookingConfirmationMessage(messageOpts),
    campaignType: "booking",
    templateParams: bookingConfirmationTemplateParams(messageOpts),
    source: `booking-auto-${booking.id}`,
  }).catch((e) => console.error("Auto WhatsApp send failed:", e));
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const raw = await req.json();
    const parseResult = BookingFormSchema.safeParse(raw);
    if (!parseResult.success) {
      return jsonError(parseResult.error.issues[0]?.message || "Invalid input", 400);
    }
    const body = parseResult.data;
    const booking = await createBooking(body, user.username);
    void maybeAutoSendBookingWhatsApp(booking.id, req.nextUrl.origin);
    return jsonOk({ ok: true, id: booking.id, serial: booking.monthlySerial });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create booking";
    return jsonError(msg);
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0", 10);
  if (!id) return jsonError("Booking id required");
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return jsonError("Not found", 404);
  return jsonOk({
    id: booking.id,
    monthly_serial: booking.monthlySerial,
    customer_name: booking.customerName,
    customer_address: booking.customerAddress,
    contact_1: booking.contact1,
    whatsapp_no: booking.whatsappNo,
    venue: booking.venue,
    security_deposit: booking.securityDeposit,
    common_notes: booking.commonNotes,
    staff_names: booking.staffNames ? booking.staffNames.split(", ") : [],
    delivery_date: booking.deliveryDate.toISOString().slice(0, 10),
    delivery_time: booking.deliveryTime,
    return_date: booking.returnDate.toISOString().slice(0, 10),
    return_time: booking.returnTime,
    items: booking.bookingItems.map((bi) => ({
      item_id: bi.itemId,
      dress_name: bi.dressName,
      category: bi.category,
      size: bi.size,
      price: bi.price,
      advance: bi.advance,
      notes: bi.notes || "",
      photo: bi.item?.photo || "",
    })),
  });
}
