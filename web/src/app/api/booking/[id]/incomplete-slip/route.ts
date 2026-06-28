import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import { isIncompleteSlipEligible } from "@/lib/bookingStatus";
import { buildIncompleteSlipData, SLIP_BIZ } from "@/lib/slipBookingData";

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
  if (!isIncompleteSlipEligible(booking)) {
    return jsonError("Incomplete return slip is only available for incomplete returns", 400);
  }

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);
  const data = buildIncompleteSlipData(booking);

  return jsonOk({
    ...data,
    qrDataUrl,
    businessName: SLIP_BIZ.name,
    businessPhone: SLIP_BIZ.phone,
    businessAddress: SLIP_BIZ.address,
  });
}
