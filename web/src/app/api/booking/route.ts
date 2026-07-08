import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { createBooking } from "@/lib/services/bookingCrud";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";
import {
  scheduleBookingBill,
  processWhatsAppJobQueue,
} from "@/lib/services/whatsapp/jobQueue";
import { BookingFormSchema } from "@/lib/validation";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

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

    await scheduleBookingBill(booking.id, req.nextUrl.origin, user.username);
    try {
      await processWhatsAppJobQueue(3, { bookingId: booking.id });
    } catch (e) {
      console.error("[booking POST] whatsapp queue error:", e);
    }

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
      photo: bi.item ? catalogPhotoRef(bi.item) : "",
    })),
  });
}
