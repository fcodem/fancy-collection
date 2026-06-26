export const STAR_BOOKING_RENT_THRESHOLD = 3000;

export type StarBookingInput = {
  price?: number | null;
  totalPrice?: number | null;
  bookingItems?: Array<{ price?: number | null }>;
  items?: Array<{ price?: number | null }>;
};

/** Star when any dress rent exceeds the threshold (legacy bookings use `price`). */
export function isStarBooking(booking: StarBookingInput): boolean {
  const itemRows = booking.bookingItems || booking.items;
  if (itemRows?.length) {
    return itemRows.some((row) => (row.price ?? 0) > STAR_BOOKING_RENT_THRESHOLD);
  }
  return (booking.price ?? booking.totalPrice ?? 0) > STAR_BOOKING_RENT_THRESHOLD;
}

export function withStarFlag<T extends StarBookingInput>(booking: T): T & { is_star: boolean } {
  return { ...booking, is_star: isStarBooking(booking) };
}
