import "server-only";

import { bookingQrDataUrl, ensureBookingQrToken } from "@/lib/bookingQr";
import { photoUrl } from "@/lib/photoUrl";
import {
  formatSlipDateTime,
  SLIP_BRAND_NAME,
  SLIP_DEFAULT_ADDRESS,
  SLIP_DEFAULT_PHONE,
} from "@/lib/slipConstants";
import {
  generateBookingBillPdf,
  type BookingBillPdfInput,
} from "./bookingBillPdf";

function resolveOrigin(requestOrigin?: string): string {
  const vercelOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
    : undefined;
  const raw =
    requestOrigin?.replace(/\/$/, "") ||
    process.env.BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    vercelOrigin ||
    "http://127.0.0.1:3000";
  return raw.replace("://localhost", "://127.0.0.1");
}

type FallbackBooking = {
  id: number;
  publicBookingId?: string | null;
  customerName: string;
  customerAddress: string;
  contact1: string;
  whatsappNo?: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  venue?: string | null;
  staffNames?: string | null;
  securityDeposit: number;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  commonNotes?: string | null;
  monthlySerial: number;
  bookingItems: Array<{
    dressName: string;
    category?: string | null;
    size?: string | null;
    price: number;
    advance: number;
    remaining: number;
    notes?: string | null;
    item?: { photo?: string | null; color?: string | null } | null;
  }>;
};

/** jsPDF booking slip when Chromium/Puppeteer cannot launch on Vercel. */
export async function generateBookingBillPdfFallback(
  booking: FallbackBooking,
  publicBookingId: string,
  requestOrigin?: string,
): Promise<Buffer> {
  const delivery = formatSlipDateTime(booking.deliveryDate);
  const ret = formatSlipDateTime(booking.returnDate);
  const origin = resolveOrigin(requestOrigin);
  const qrToken = await ensureBookingQrToken(booking.id);
  const qrDataUrl = await bookingQrDataUrl(qrToken, origin, 200);

  const input: BookingBillPdfInput = {
    booking: {
      publicBookingId,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress,
      contact1: booking.contact1,
      whatsappNo: booking.whatsappNo || booking.contact1,
      deliveryDate: delivery.date,
      deliveryTime: booking.deliveryTime || delivery.time,
      returnDate: ret.date,
      returnTime: booking.returnTime || ret.time,
      venue: booking.venue ?? null,
      staffNames: booking.staffNames ?? null,
      securityDeposit: booking.securityDeposit,
      totalPrice: booking.totalPrice,
      totalAdvance: booking.totalAdvance,
      totalRemaining: booking.totalRemaining,
      commonNotes: booking.commonNotes ?? null,
      monthlySerial: booking.monthlySerial,
    },
    items: booking.bookingItems.map((bi) => ({
      dressName: bi.dressName,
      category: bi.category || "",
      size: bi.size || "",
      price: bi.price,
      advance: bi.advance,
      remaining: bi.remaining,
      notes: bi.notes ?? null,
      imageUrl: bi.item?.photo ? photoUrl(bi.item.photo) : null,
    })),
    qrDataUrl,
    businessName: SLIP_BRAND_NAME,
    businessPhone: SLIP_DEFAULT_PHONE,
    businessAddress: SLIP_DEFAULT_ADDRESS,
  };

  return generateBookingBillPdf(input);
}
