/** Item-level delivery flags can be ahead of booking.status — resolve for display and sync. */
export type BookingStatusSource = {
  status: string;
  bookingItems?: Array<{
    isDelivered: boolean;
  }>;
};

/**
 * Resolve display/sync status. Delivery can be inferred from item flags when booking
 * is still "booked". Return is never inferred — only explicit mark_returned sets it.
 */
export function resolveBookingStatus(booking: BookingStatusSource): string {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "incomplete_return") return "incomplete_return";
  if (booking.status === "returned") return "returned";
  if (booking.status === "delivered") return "delivered";

  const items = booking.bookingItems ?? [];
  if (items.length > 0 && booking.status === "booked") {
    const allDelivered = items.every((bi) => bi.isDelivered);
    if (allDelivered) return "delivered";
  }

  return booking.status;
}

export function isBookingDelivered(booking: BookingStatusSource): boolean {
  const s = resolveBookingStatus(booking);
  return s === "delivered";
}

export function isBookingReturned(booking: BookingStatusSource): boolean {
  return booking.status === "returned" || booking.status === "incomplete_return";
}
