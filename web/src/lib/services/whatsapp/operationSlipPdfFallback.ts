import "server-only";

import jsPDF from "jspdf";
import {
  formatSlipDateTime,
  SLIP_BRAND_NAME,
  SLIP_DEFAULT_PHONE,
  slipRs,
} from "@/lib/slipConstants";
import { resolvePublicBookingId } from "./publicBookingId";

type SlipFallbackKind = "delivery" | "return" | "incomplete";

type SlipBooking = {
  id: number;
  publicBookingId?: string | null;
  monthlySerial: number;
  customerName: string;
  contact1: string;
  whatsappNo?: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  venue?: string | null;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  securityDeposit: number;
  bookingItems: Array<{
    id: number;
    dressName: string;
    category?: string | null;
    size?: string | null;
    isDelivered?: boolean;
    isReturned?: boolean;
    isIncompleteReturn?: boolean;
    itemIncompleteNotes?: string | null;
  }>;
};

function titleFor(kind: SlipFallbackKind): string {
  if (kind === "delivery") return "DELIVERY SLIP";
  if (kind === "return") return "RETURN SLIP";
  return "INCOMPLETE RETURN SLIP";
}

/**
 * Compact jsPDF slip when Chromium HTML→PDF is unavailable on Vercel.
 * Good enough for Meta document send so WhatsApp still works.
 */
export function generateOperationSlipPdfFallback(
  kind: SlipFallbackKind,
  booking: SlipBooking,
  itemIds?: number[],
): Buffer {
  const publicId = resolvePublicBookingId(booking);
  const delivery = formatSlipDateTime(booking.deliveryDate);
  const ret = formatSlipDateTime(booking.returnDate);
  const items =
    itemIds?.length
      ? booking.bookingItems.filter((bi) => itemIds.includes(bi.id))
      : booking.bookingItems;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(SLIP_BRAND_NAME, 105, y, { align: "center" });
  y += 8;
  doc.setFontSize(13);
  doc.text(titleFor(kind), 105, y, { align: "center" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines = [
    `Booking: ${publicId}  (serial ${String(booking.monthlySerial).padStart(2, "0")})`,
    `Customer: ${booking.customerName}`,
    `Phone: ${booking.whatsappNo || booking.contact1}`,
    `Delivery: ${delivery.date} ${booking.deliveryTime || delivery.time}`,
    `Return: ${ret.date} ${booking.returnTime || ret.time}`,
    `Venue: ${booking.venue || "—"}`,
    `Total: ${slipRs(booking.totalPrice)}  Advance: ${slipRs(booking.totalAdvance)}  Remaining: ${slipRs(booking.totalRemaining)}`,
    `Security: ${slipRs(booking.securityDeposit)}`,
    `Shop: ${SLIP_DEFAULT_PHONE}`,
  ];
  for (const line of lines) {
    doc.text(line, 14, y);
    y += 7;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Items", 14, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const bi of items) {
    const flags: string[] = [];
    if (bi.isDelivered) flags.push("delivered");
    if (bi.isReturned) flags.push("returned");
    if (bi.isIncompleteReturn) flags.push("incomplete");
    const meta = [bi.category, bi.size, flags.join(", ")].filter(Boolean).join(" · ");
    const row = `• ${bi.dressName}${meta ? ` (${meta})` : ""}`;
    const wrapped = doc.splitTextToSize(row, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5 + 2;
    if (bi.itemIncompleteNotes) {
      const note = doc.splitTextToSize(`  Note: ${bi.itemIncompleteNotes}`, 180);
      doc.text(note, 14, y);
      y += note.length * 5 + 2;
    }
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
  }

  y = Math.max(y + 8, 270);
  doc.setFontSize(9);
  doc.text("Thank you for choosing Fancy Collection.", 105, y, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
