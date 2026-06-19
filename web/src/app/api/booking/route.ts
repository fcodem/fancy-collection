import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { createBooking, updateBooking } from "@/lib/services/bookingCrud";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { debugLog } from "@/lib/debugLog";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const booking = await createBooking(body);
    // #region agent log
    debugLog("booking/route.ts", "booking created", {
      id: booking.id,
      serial: booking.monthlySerial,
      itemCount: body.items?.length ?? 0,
    }, "D");
    // #endregion
    return jsonOk({ ok: true, id: booking.id, serial: booking.monthlySerial });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create booking";
    // #region agent log
    debugLog("booking/route.ts", "booking create failed", { error: msg }, "D");
    // #endregion
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
