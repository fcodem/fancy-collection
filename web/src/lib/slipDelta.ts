export type SlipScope = "full" | "single" | "combined";

export type BookingItemDeltaRow = {
  id: number;
  isDelivered?: boolean;
  isReturned?: boolean;
  isIncompleteReturn?: boolean;
  deliverySlipNotifiedAt?: Date | null;
  returnSlipNotifiedAt?: Date | null;
};

export type SlipScopeResult = {
  scope: SlipScope;
  bookingItemId?: number;
  bookingItemIds: number[];
};

/** Items delivered in this batch (not yet on a delivery slip). */
export function deliveryDeltaItems(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): BookingItemDeltaRow[] {
  const items = booking.bookingItems ?? [];
  if (explicitIds?.length) {
    const idSet = new Set(explicitIds);
    return items.filter((bi) => idSet.has(bi.id) && bi.isDelivered);
  }
  return items.filter((bi) => bi.isDelivered && !bi.deliverySlipNotifiedAt);
}

export function resolveDeliveryScope(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): SlipScopeResult | null {
  const allItems = booking.bookingItems ?? [];
  const delta = deliveryDeltaItems(booking, explicitIds);
  if (delta.length === 0) return null;

  const ids = delta.map((bi) => bi.id);

  if (delta.length === allItems.length && allItems.length > 0) {
    return { scope: "full", bookingItemIds: ids };
  }
  if (delta.length === 1) {
    return { scope: "single", bookingItemId: ids[0], bookingItemIds: ids };
  }
  return { scope: "combined", bookingItemIds: ids };
}

/** Items returned (not incomplete) not yet on a return slip. */
export function returnDeltaItems(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): BookingItemDeltaRow[] {
  const items = booking.bookingItems ?? [];
  if (explicitIds?.length) {
    const idSet = new Set(explicitIds);
    return items.filter(
      (bi) => idSet.has(bi.id) && bi.isReturned && !bi.isIncompleteReturn,
    );
  }
  return items.filter(
    (bi) => bi.isReturned && !bi.isIncompleteReturn && !bi.returnSlipNotifiedAt,
  );
}

export function resolvePartialReturnScope(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): SlipScopeResult | null {
  const allItems = booking.bookingItems ?? [];
  const delivered = allItems.filter((bi) => bi.isDelivered);
  const delta = returnDeltaItems(booking, explicitIds);
  if (delta.length === 0) return null;

  const ids = delta.map((bi) => bi.id);

  if (delta.length === delivered.length && delivered.length > 0) {
    return { scope: "full", bookingItemIds: ids };
  }
  if (delta.length === 1) {
    return { scope: "single", bookingItemId: ids[0], bookingItemIds: ids };
  }
  return { scope: "combined", bookingItemIds: ids };
}

/** Items newly marked incomplete — not yet on an incomplete slip. */
export function incompleteDeltaItems(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): BookingItemDeltaRow[] {
  const items = booking.bookingItems ?? [];
  if (explicitIds?.length) {
    const idSet = new Set(explicitIds);
    return items.filter((bi) => idSet.has(bi.id) && bi.isIncompleteReturn);
  }
  return items.filter((bi) => bi.isIncompleteReturn && !bi.returnSlipNotifiedAt);
}

export function resolveIncompleteScope(
  booking: { bookingItems?: BookingItemDeltaRow[] },
  explicitIds?: number[],
): SlipScopeResult | null {
  const delta = incompleteDeltaItems(booking, explicitIds);
  if (delta.length === 0) return null;

  const ids = delta.map((bi) => bi.id);
  if (delta.length === 1) {
    return { scope: "single", bookingItemId: ids[0], bookingItemIds: ids };
  }
  return { scope: "combined", bookingItemIds: ids };
}

export function parseBookingItemIdsParam(
  raw: string | null | undefined,
): number[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n > 0);
  return ids.length > 0 ? ids : undefined;
}

/** Item IDs marked delivered in this save request (not already delivered). */
export function newlyDeliveredItemIdsFromPayload(
  body: {
    mark_delivered?: boolean;
    items?: Array<{
      booking_item_id: number;
      mark_delivered?: boolean;
      update_only?: boolean;
    }>;
  },
  beforeItems: Array<{ id: number; isDelivered: boolean }>,
): number[] {
  const beforeMap = new Map(beforeItems.map((bi) => [bi.id, bi.isDelivered]));
  if (Array.isArray(body.items) && body.items.length > 0) {
    const ids: number[] = [];
    for (const it of body.items) {
      if (it.update_only) continue;
      if (!it.mark_delivered) continue;
      const id = Number(it.booking_item_id);
      if (id > 0 && !beforeMap.get(id)) ids.push(id);
    }
    return ids;
  }
  if (body.mark_delivered) {
    return beforeItems.filter((bi) => !bi.isDelivered).map((bi) => bi.id);
  }
  return [];
}

/** Item IDs marked returned (not incomplete) in this return save action. */
export function newlyReturnedItemIdsFromAction(
  action: string,
  data: {
    booking_item_id?: number;
    items?: Array<{ booking_item_id: number; is_incomplete?: boolean }>;
  },
  beforeItems: BookingItemDeltaRow[],
): number[] {
  if (action === "mark_returned") {
    return beforeItems
      .filter((bi) => bi.isDelivered && !bi.isReturned)
      .map((bi) => bi.id);
  }
  if (action === "mark_item_returned" && data.booking_item_id) {
    const id = Number(data.booking_item_id);
    const bi = beforeItems.find((b) => b.id === id);
    if (bi?.isDelivered && !bi.isReturned) return [id];
    return [];
  }
  if (action === "incomplete_return" && data.items?.length) {
    return data.items
      .filter((i) => !i.is_incomplete)
      .map((i) => Number(i.booking_item_id))
      .filter((id) => {
        if (id <= 0) return false;
        const bi = beforeItems.find((b) => b.id === id);
        return Boolean(bi?.isDelivered && !bi.isReturned);
      });
  }
  return [];
}

/** Item IDs newly marked incomplete in this return save action. */
export function newlyIncompleteItemIdsFromAction(
  action: string,
  data: {
    items?: Array<{ booking_item_id: number; is_incomplete?: boolean }>;
  },
  beforeItems: BookingItemDeltaRow[],
): number[] {
  if (action !== "incomplete_return") return [];
  if (data.items?.length) {
    return data.items
      .filter((i) => i.is_incomplete)
      .map((i) => Number(i.booking_item_id))
      .filter((id) => {
        if (id <= 0) return false;
        const bi = beforeItems.find((b) => b.id === id);
        return Boolean(bi?.isDelivered && !bi.isIncompleteReturn);
      });
  }
  return beforeItems
    .filter((bi) => bi.isDelivered && !bi.isIncompleteReturn)
    .map((bi) => bi.id);
}
