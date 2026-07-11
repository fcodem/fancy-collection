import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import { isDeliverySlipEligible, resolveDeliverySlipItemId } from "@/lib/bookingStatus";
import { buildDeliverySlipData, SLIP_BIZ } from "@/lib/slipBookingData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking ID", 400);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { color: true, photo: true, originalPhoto: true, enhancedPhoto: true } } },
      },
    },
  });

  if (!booking) return jsonError("Booking not found", 404);
  if (!isDeliverySlipEligible(booking)) {
    return jsonError("Delivery slip is only available for delivered bookings", 400);
  }

  const itemParam = req.nextUrl.searchParams.get("item");
  const slipItemId = resolveDeliverySlipItemId(booking, itemParam);
  if (slipItemId === "pick") {
    return jsonError("Select a delivered dress for partial delivery slip", 400);
  }

  let slipData;
  try {
    slipData = buildDeliverySlipData(booking, { bookingItemId: slipItemId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid delivery slip request";
    return jsonError(msg, 400);
  }

  const { booking: slipBooking, items, slipSubtitle } = slipData;

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  return jsonOk({
    booking: slipBooking,
    items,
    slipSubtitle,
    qrDataUrl,
    businessName: SLIP_BIZ.name,
    businessPhone: SLIP_BIZ.phone,
    businessAddress: SLIP_BIZ.address,
  });
}
