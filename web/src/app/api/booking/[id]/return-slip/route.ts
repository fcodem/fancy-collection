import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import { isReturnSlipEligible, resolveReturnSlip } from "@/lib/bookingStatus";
import { buildReturnSlipData, SLIP_BIZ } from "@/lib/slipBookingData";

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
        include: { item: { select: { color: true } } },
      },
    },
  });

  if (!booking) return jsonError("Booking not found", 404);
  if (!isReturnSlipEligible(booking)) {
    return jsonError("Return receipt is only available for returned bookings", 400);
  }

  const itemParam = req.nextUrl.searchParams.get("item");
  const resolved = resolveReturnSlip(booking, itemParam);
  if (resolved === "invalid") {
    return jsonError("No returned dresses on this booking", 400);
  }

  let slipData;
  try {
    slipData = buildReturnSlipData(booking, {
      scope: resolved.scope,
      bookingItemId: resolved.scope === "single" ? resolved.bookingItemId : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid return slip request";
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
