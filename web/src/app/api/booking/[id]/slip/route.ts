import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";
import { formatDate } from "@/lib/constants";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import { resolvePublicBookingId } from "@/lib/services/whatsapp/publicBookingId";

const BIZ_NAME = process.env.BUSINESS_NAME || "Fancy Collection by Renu Agarwal";
const BIZ_PHONE = process.env.BUSINESS_PHONE || "8077843874, 8630834711";
const BIZ_ADDRESS =
  process.env.BUSINESS_ADDRESS ||
  "Banwata Ganj Near Balaji Mandir Court Road Moradabad 244001";
const BIZ_TAGLINE =
  process.env.BUSINESS_TAGLINE || "Premium Cloth Rental — Elegance for Every Occasion";

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
        include: {
          item: {
            select: {
              color: true,
              photo: true,
            },
          },
        },
      },
    },
  });

  if (!booking) return jsonError("Booking not found", 404);

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, undefined, 280);

  const publicId = resolvePublicBookingId(booking);

  return jsonOk({
    booking: {
      publicBookingId: publicId,
      monthlySerial: booking.monthlySerial,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo,
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime,
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime,
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit: booking.securityDeposit,
      totalPrice: booking.totalPrice,
      totalAdvance: booking.totalAdvance,
      totalRemaining: booking.totalRemaining,
      commonNotes: booking.commonNotes,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
    },
    items: booking.bookingItems.map((bi) => ({
      dressName: bi.dressName,
      category: bi.category || "",
      size: bi.size || "",
      color: bi.item?.color ?? null,
      photoUrl: bi.item ? catalogPhotoRef(bi.item) || null : null,
      price: bi.price,
      advance: bi.advance,
      remaining: bi.remaining,
      notes: bi.notes,
    })),
    qrDataUrl,
    businessName: BIZ_NAME,
    businessPhone: BIZ_PHONE,
    businessAddress: BIZ_ADDRESS,
    businessTagline: BIZ_TAGLINE,
  });
}
