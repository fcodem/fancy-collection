import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";

export const STANDARD_BOOKING_HEADERS = [
  "S.No",
  "Customer",
  "Address",
  "Total Rent",
  "Security",
  "Dress",
  "Dress Notes",
  "Common Note",
  "Delivery",
  "Return",
];

export function standardBookingPdfRow(serial: number | string, d: StandardBookingDetails): string[] {
  return [
    String(serial).padStart(2, "0"),
    d.customer_name || "—",
    d.customer_address || "—",
    `₹${formatInr(d.total_rent)}`,
    `₹${formatInr(d.security_deposit)}`,
    d.dress_names || "—",
    d.item_notes || "—",
    d.common_notes || "—",
    `${d.delivery_date || "—"}${d.delivery_time ? ` ${d.delivery_time}` : ""}`,
    `${d.return_date || "—"}${d.return_time ? ` ${d.return_time}` : ""}`,
  ];
}

export function balanceRemainingLabel(
  totalRemaining?: number,
  remainingCollected?: number,
  balanceRemaining?: number,
): string {
  const left =
    balanceRemaining ?? Math.max(0, (totalRemaining || 0) - (remainingCollected || 0));
  return left > 0 ? `₹${formatInr(left)}` : "Paid ✓";
}
