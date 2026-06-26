import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import {
  balanceLeftToCollect,
  serializeRecordBookingDetails,
  type StandardBookingDetails,
} from "@/lib/bookingDetails";
import { pdfCurrency, pdfPaidLabel } from "@/lib/pdfFormat";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";

export const STANDARD_BOOKING_HEADERS = [
  "S.No",
  "Customer",
  "Address",
  "Contact",
  "WhatsApp",
  "Venue",
  "Total Rent",
  "Advance",
  "Balance Left",
  "Security",
  "Dress",
  "Dress Notes",
  "Common Note",
  "Delivery",
  "Return",
];

export type BookingPdfRowResult = {
  cells: string[];
  warningsBelow?: PdfWarningPanel[];
};

export type BookingPdfFields = StandardBookingDetails & {
  contact1?: string;
  contact_1?: string;
  whatsapp?: string;
  whatsapp_no?: string;
  venue?: string;
  staff_names?: string;
  total_advance?: number;
  total_remaining?: number;
  remaining_collected?: number;
  balance_remaining?: number;
};

export function flattenBookingPdfRows(results: BookingPdfRowResult[]): {
  rows: string[][];
  warningsBelow: (PdfWarningPanel[] | undefined)[];
} {
  return {
    rows: results.map((r) => r.cells),
    warningsBelow: results.map((r) =>
      r.warningsBelow?.length ? r.warningsBelow : undefined,
    ),
  };
}

export function computeBalanceLeft(d: BookingPdfFields): number {
  const collected = d.remaining_collected ?? 0;

  if (d.balance_remaining != null && d.balance_remaining > 0) {
    return d.balance_remaining;
  }

  const fromRemaining = Math.max(0, (d.total_remaining ?? 0) - collected);
  if (fromRemaining > 0) return fromRemaining;

  const rent = d.total_rent ?? 0;
  const advance = d.total_advance;
  if (advance != null && rent > advance) {
    return Math.max(0, rent - advance - collected);
  }

  return 0;
}

export function balanceRemainingLabel(d: BookingPdfFields): string {
  const left = computeBalanceLeft(d);
  return left > 0 ? pdfCurrency(left) : pdfPaidLabel();
}

export function standardBookingPdfRow(
  serial: number | string,
  d: BookingPdfFields,
  trailingExtras: string[] = [],
  warningsBelow?: PdfWarningPanel[],
): BookingPdfRowResult {
  const contact = d.contact_1 || d.contact1 || "—";
  const whatsapp = d.whatsapp_no || d.whatsapp || "—";
  const advance = d.total_advance;
  return {
    cells: [
      String(serial).padStart(2, "0"),
      d.customer_name || "—",
      d.customer_address || "—",
      contact,
      whatsapp,
      d.venue || "—",
      pdfCurrency(d.total_rent),
      advance != null ? pdfCurrency(advance) : "—",
      balanceRemainingLabel(d),
      pdfCurrency(d.security_deposit),
      d.dress_names || "—",
      d.item_notes || "—",
      d.common_notes || "—",
      `${d.delivery_date || "—"}${d.delivery_time ? ` ${d.delivery_time}` : ""}`,
      `${d.return_date || "—"}${d.return_time ? ` ${d.return_time}` : ""}`,
      ...trailingExtras,
    ],
    warningsBelow: warningsBelow?.length ? warningsBelow : undefined,
  };
}

export function recordBookingPdfHeaders(...extraCols: string[]): string[] {
  return [...STANDARD_BOOKING_HEADERS, ...extraCols];
}

export function recordBookingPdfRow(
  serial: number | string,
  b: BookingForStandardDetails & {
    monthlySerial?: number;
    totalAdvance?: number;
    advance?: number;
    totalRemaining?: number;
    remaining?: number;
    remainingCollected?: number;
  },
  extraCols: string[] = [],
  warningsBelow?: PdfWarningPanel[],
): BookingPdfRowResult {
  const rec = serializeRecordBookingDetails(b);
  const balance = balanceLeftToCollect(
    b.totalRemaining ?? b.remaining,
    b.remainingCollected,
  );
  const rent = rec.total_rent;
  const advance = rec.total_advance;
  const resolvedBalance =
    balance > 0
      ? balance
      : advance != null && rent > advance
        ? Math.max(0, rent - advance - (b.remainingCollected ?? 0))
        : 0;

  return standardBookingPdfRow(
    serial,
    {
      ...rec,
      contact_1: rec.contact1,
      whatsapp_no: rec.whatsapp,
      total_advance: advance,
      total_remaining: rec.total_remaining,
      remaining_collected: b.remainingCollected,
      balance_remaining: resolvedBalance,
    },
    extraCols,
    warningsBelow,
  );
}
