/** Per-dress bill line: rental + fitting charges. */
export function bookingItemLineTotal(price: number, fittingCharges = 0): number {
  return (price || 0) + (fittingCharges || 0);
}

export function bookingItemRemaining(
  price: number,
  advance: number,
  fittingCharges = 0,
): number {
  return Math.max(0, bookingItemLineTotal(price, fittingCharges) - (advance || 0));
}

export function sumBookingFittingCharges(
  items: Array<{ fittingCharges?: number | null }>,
): number {
  return items.reduce((s, row) => s + (row.fittingCharges || 0), 0);
}

/** Fitting charges for dresses already handed over (delivered items only). */
export function sumDeliveredFittingCharges(
  bookings: Array<{
    bookingItems?: Array<{
      fittingCharges?: number | null;
      isDelivered?: boolean | null;
      isCancelled?: boolean | null;
    }>;
  }>,
): number {
  let total = 0;
  for (const b of bookings) {
    for (const bi of b.bookingItems || []) {
      if (bi.isCancelled || !bi.isDelivered) continue;
      total += bi.fittingCharges || 0;
    }
  }
  return total;
}
