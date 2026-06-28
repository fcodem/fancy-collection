/** Item-level delivery flags can be ahead of booking.status — resolve for display and sync. */
export type BookingStatusSource = {
  status: string;
  bookingItems?: Array<{
    id?: number;
    isDelivered: boolean;
  }>;
};

/**
 * Resolve display/sync status. Delivery can be inferred from item flags when booking
 * is still "booked". Return is never inferred — only explicit mark_returned sets it.
 */
export function resolveBookingStatus(booking: BookingStatusSource): string {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "postponed") return "postponed";
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

export function deliveredBookingItems(booking: BookingStatusSource) {
  return (booking.bookingItems ?? []).filter((bi) => bi.isDelivered);
}

export function isAllBookingItemsDelivered(booking: BookingStatusSource): boolean {
  const items = booking.bookingItems ?? [];
  return items.length > 0 && items.every((bi) => bi.isDelivered);
}

export function hasPartialDelivery(booking: BookingStatusSource): boolean {
  const items = booking.bookingItems ?? [];
  if (items.length === 0) return false;
  const delivered = deliveredBookingItems(booking);
  return delivered.length > 0 && delivered.length < items.length;
}

/** True when at least one dress is marked delivered (or booking is fully delivered/returned). */
export function isDeliverySlipEligible(booking: BookingStatusSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  if (resolveBookingStatus(booking) === "delivered") return true;
  return deliveredBookingItems(booking).length > 0;
}

/** Common slip for all dresses — only when every item is delivered or booking is returned. */
export function isCommonDeliverySlipEligible(booking: BookingStatusSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  return isAllBookingItemsDelivered(booking) || booking.status === "delivered";
}

export function deliverySlipHref(
  bookingId: number,
  booking: BookingStatusSource,
  bookingItemId?: number,
): string {
  if (isCommonDeliverySlipEligible(booking) || !bookingItemId) {
    return `/booking/${bookingId}/delivery-slip`;
  }
  return `/booking/${bookingId}/delivery-slip?item=${bookingItemId}`;
}

/**
 * Resolve which booking item a delivery slip should cover.
 * Returns undefined for a common (all dresses) slip.
 * Returns "pick" when partial delivery has multiple delivered items but no ?item= param.
 */
export function resolveDeliverySlipItemId(
  booking: BookingStatusSource & {
    bookingItems?: Array<{ id: number; isDelivered: boolean }>;
  },
  rawItemId?: string | null,
): number | undefined | "pick" {
  if (isCommonDeliverySlipEligible(booking)) return undefined;

  const delivered = (booking.bookingItems ?? []).filter((bi) => bi.isDelivered);
  if (rawItemId) {
    const id = parseInt(rawItemId, 10);
    if (!id || !delivered.some((bi) => bi.id === id)) return "pick";
    return id;
  }
  if (delivered.length === 1) return delivered[0].id;
  return "pick";
}

/** Return receipt slip — after booking is returned, incomplete return, or any dress marked returned. */
export type ReturnSlipSource = {
  status: string;
  bookingItems?: Array<{
    id?: number;
    isDelivered?: boolean;
    isReturned?: boolean;
    isIncompleteReturn?: boolean;
  }>;
};

export function returnedBookingItems(booking: ReturnSlipSource) {
  return (booking.bookingItems ?? []).filter(
    (bi) => bi.isReturned && !bi.isIncompleteReturn,
  );
}

export function isAllDeliveredItemsReturned(booking: ReturnSlipSource): boolean {
  const delivered = (booking.bookingItems ?? []).filter((bi) => bi.isDelivered);
  const returned = returnedBookingItems(booking);
  return delivered.length > 0 && returned.length === delivered.length;
}

export function hasPartialReturn(booking: ReturnSlipSource): boolean {
  const delivered = (booking.bookingItems ?? []).filter((bi) => bi.isDelivered);
  const returned = returnedBookingItems(booking);
  return returned.length > 0 && delivered.length > 0 && returned.length < delivered.length;
}

export function isReturnSlipEligible(booking: ReturnSlipSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  return returnedBookingItems(booking).length > 0;
}

/** Full return slip for all dresses — when every delivered dress is returned or booking is closed. */
export function isCommonReturnSlipEligible(booking: ReturnSlipSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  return isAllDeliveredItemsReturned(booking);
}

export type ReturnSlipResolve =
  | { scope: "full" }
  | { scope: "single"; bookingItemId: number }
  | { scope: "combined" };

export function resolveReturnSlip(
  booking: ReturnSlipSource & {
    bookingItems?: Array<{
      id: number;
      isDelivered?: boolean;
      isReturned?: boolean;
      isIncompleteReturn?: boolean;
    }>;
  },
  rawItemId?: string | null,
): ReturnSlipResolve | "invalid" {
  const delivered = (booking.bookingItems ?? []).filter((bi) => bi.isDelivered);
  const returned = (booking.bookingItems ?? []).filter(
    (bi) => bi.isReturned && !bi.isIncompleteReturn,
  );

  if (returned.length === 0) return "invalid";

  const allReturned = delivered.length > 0 && returned.length === delivered.length;
  if (booking.status === "returned" || allReturned) return { scope: "full" };

  if (returned.length === 1) {
    const id = rawItemId ? parseInt(rawItemId, 10) : returned[0].id;
    if (!id || !returned.some((bi) => bi.id === id)) return "invalid";
    return { scope: "single", bookingItemId: id };
  }

  return { scope: "combined" };
}

export function returnSlipHref(
  bookingId: number,
  booking: ReturnSlipSource & {
    bookingItems?: Array<{
      id: number;
      isDelivered?: boolean;
      isReturned?: boolean;
      isIncompleteReturn?: boolean;
    }>;
  },
  bookingItemId?: number,
): string {
  const resolved = resolveReturnSlip(
    booking,
    bookingItemId != null ? String(bookingItemId) : null,
  );
  if (resolved === "invalid") return `/return/${bookingId}`;
  if (resolved.scope === "single") {
    return `/booking/${bookingId}/return-slip?item=${resolved.bookingItemId}`;
  }
  return `/booking/${bookingId}/return-slip`;
}

/** Incomplete return slip — missing/damaged items not fully returned. */
export function isIncompleteSlipEligible(booking: {
  status: string;
  bookingItems?: Array<{ isIncompleteReturn?: boolean }>;
}): boolean {
  if (booking.status === "incomplete_return") return true;
  return (booking.bookingItems ?? []).some((bi) => bi.isIncompleteReturn);
}

export function isBookingReturned(booking: BookingStatusSource): boolean {
  return booking.status === "returned" || booking.status === "incomplete_return";
}
