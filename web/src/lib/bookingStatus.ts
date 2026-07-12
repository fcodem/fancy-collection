/** Item-level delivery flags can be ahead of booking.status — resolve for display and sync. */
export type BookingStatusSource = {
  status: string;
  bookingItems?: Array<{
    id?: number;
    isDelivered?: boolean;
    isReturned?: boolean;
    isIncompleteReturn?: boolean;
    isCancelled?: boolean;
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

  const items = (booking.bookingItems ?? []).filter((bi) => !bi.isCancelled);
  if (items.length > 0 && booking.status === "booked") {
    const allDelivered = items.every((bi) => bi.isDelivered === true);
    if (allDelivered) return "delivered";
  }

  return booking.status;
}

export function isBookingDelivered(booking: BookingStatusSource): boolean {
  const s = resolveBookingStatus(booking);
  return s === "delivered";
}

export function deliveredBookingItems(booking: BookingStatusSource) {
  return (booking.bookingItems ?? []).filter((bi) => bi.isDelivered === true && !bi.isCancelled);
}

export function isAllBookingItemsDelivered(booking: BookingStatusSource): boolean {
  const items = (booking.bookingItems ?? []).filter((bi) => !bi.isCancelled);
  return items.length > 0 && items.every((bi) => bi.isDelivered === true);
}

export function hasPartialDelivery(booking: BookingStatusSource): boolean {
  const items = (booking.bookingItems ?? []).filter((bi) => !bi.isCancelled);
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
  bookingItemIds?: number[],
): string {
  const scopedIds = (bookingItemIds ?? []).filter((id) => id > 0);
  if (scopedIds.length > 1) {
    return `/booking/${bookingId}/delivery-slip?items=${scopedIds.join(",")}`;
  }
  if (scopedIds.length === 1) {
    return `/booking/${bookingId}/delivery-slip?item=${scopedIds[0]}`;
  }
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
    bookingItems?: Array<{ id?: number; isDelivered?: boolean }>;
  },
  rawItemId?: string | null,
): number | undefined | "pick" {
  if (isCommonDeliverySlipEligible(booking)) return undefined;

  const delivered = (booking.bookingItems ?? []).filter((bi) => bi.isDelivered === true);
  if (rawItemId) {
    const id = parseInt(rawItemId, 10);
    if (!id || !delivered.some((bi) => bi.id === id)) return "pick";
    return id;
  }
  if (delivered.length === 1 && delivered[0].id != null) return delivered[0].id;
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
    isCancelled?: boolean;
  }>;
};

export function returnedBookingItems(booking: ReturnSlipSource) {
  return (booking.bookingItems ?? []).filter(
    (bi) => bi.isReturned === true && !bi.isIncompleteReturn && !bi.isCancelled,
  );
}

export function isAllDeliveredItemsReturned(booking: ReturnSlipSource): boolean {
  const delivered = (booking.bookingItems ?? []).filter(
    (bi) => bi.isDelivered === true && !bi.isCancelled,
  );
  const returned = returnedBookingItems(booking);
  return delivered.length > 0 && returned.length === delivered.length;
}

/** True when some (not all) delivered dresses have been returned. */
export function hasPartialReturn(booking: ReturnSlipSource): boolean {
  const delivered = (booking.bookingItems ?? []).filter(
    (bi) => bi.isDelivered === true && !bi.isCancelled,
  );
  const returned = returnedBookingItems(booking);
  return returned.length > 0 && delivered.length > 0 && returned.length < delivered.length;
}

/** Undelivered dresses still pending on an open booking. */
export function hasUndeliveredItems(booking: ReturnSlipSource): boolean {
  return (booking.bookingItems ?? []).some(
    (bi) => !bi.isDelivered && !bi.isCancelled,
  );
}

export function isReturnSlipEligible(booking: ReturnSlipSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  return returnedBookingItems(booking).length > 0;
}

/**
 * Full/common return slip — only when the booking is closed, or every active dress
 * was delivered and returned (no pending pickup left).
 */
export function isCommonReturnSlipEligible(booking: ReturnSlipSource): boolean {
  if (booking.status === "returned" || booking.status === "incomplete_return") return true;
  if (hasUndeliveredItems(booking)) return false;
  return isAllDeliveredItemsReturned(booking);
}

export type ReturnSlipResolve =
  | { scope: "full" }
  | { scope: "single"; bookingItemId: number }
  | { scope: "combined" };

export function resolveReturnSlip(
  booking: ReturnSlipSource,
  rawItemId?: string | null,
): ReturnSlipResolve | "invalid" {
  const delivered = (booking.bookingItems ?? []).filter(
    (bi) => bi.isDelivered === true && !bi.isCancelled,
  );
  const returned = (booking.bookingItems ?? []).filter(
    (bi) => bi.isReturned === true && !bi.isIncompleteReturn && !bi.isCancelled,
  );
  const undelivered = (booking.bookingItems ?? []).filter(
    (bi) => !bi.isDelivered && !bi.isCancelled,
  );

  if (returned.length === 0) return "invalid";

  const allDeliveredReturned = delivered.length > 0 && returned.length === delivered.length;
  // Full slip only when booking is closed, or nothing left pending pickup.
  if (
    booking.status === "returned" ||
    (allDeliveredReturned && undelivered.length === 0)
  ) {
    return { scope: "full" };
  }

  if (returned.length === 1) {
    const id = rawItemId ? parseInt(rawItemId, 10) : returned[0].id;
    if (!id || !returned.some((bi) => bi.id === id)) return "invalid";
    return { scope: "single", bookingItemId: id };
  }

  if (rawItemId) {
    const id = parseInt(rawItemId, 10);
    if (id && returned.some((bi) => bi.id === id)) {
      return { scope: "single", bookingItemId: id };
    }
  }

  return { scope: "combined" };
}

export function returnSlipHref(
  bookingId: number,
  booking: ReturnSlipSource,
  bookingItemId?: number,
  bookingItemIds?: number[],
): string {
  const scopedIds = (bookingItemIds ?? []).filter((id) => id > 0);
  if (scopedIds.length > 1) {
    return `/booking/${bookingId}/return-slip?items=${scopedIds.join(",")}`;
  }
  if (scopedIds.length === 1) {
    return `/booking/${bookingId}/return-slip?item=${scopedIds[0]}`;
  }
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
