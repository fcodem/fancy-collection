export function dressNameWords(q: string): string[] {
  return (q || "").split(/\s+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
}

export function dressNameMatches(text: string, q: string): boolean {
  const textL = (text || "").toLowerCase();
  const words = dressNameWords(q);
  if (!words.length) return true;
  return words.every((w) => textL.includes(w));
}

/** Client-side inventory filter — name, display label, or SKU/item code. */
export function inventoryItemMatches(
  item: { name?: string | null; display_name?: string | null; sku?: string | null },
  q: string,
): boolean {
  if (!q.trim()) return true;
  return (
    dressNameMatches(item.name || "", q) ||
    dressNameMatches(item.display_name || "", q) ||
    dressNameMatches(item.sku || "", q)
  );
}

export function isSherwaniCategory(category?: string | null): boolean {
  return (category || "").trim().toLowerCase() === "sherwani";
}

const UNIT_SUFFIX_RE = /\s+#\d+$/;

export function stripUnitSuffix(name?: string | null): string {
  return (name || "").replace(UNIT_SUFFIX_RE, "").trim();
}

export function formatUnitName(baseName: string, unitIndex: number): string {
  const base = baseName.trim();
  return unitIndex > 1 ? `${base} #${unitIndex}` : base;
}

export function dressDisplayName(name?: string | null, category?: string | null, size?: string | null): string {
  const n = (name || "").trim();
  const sz = (size || "").trim();
  if (sz) {
    const low = n.toLowerCase();
    if (!low.includes(`size ${sz.toLowerCase()}`) && !n.includes(`(${sz})`) && !low.includes("· size")) {
      return `${n} · Size ${sz}`;
    }
  }
  return n;
}

export function buildDressSearchWhere(q: string) {
  const words = dressNameWords(q);
  if (!words.length) return undefined;
  return {
    AND: words.map((word) => ({
      OR: [
        { name: { contains: word, mode: "insensitive" as const } },
        { sku: { contains: word, mode: "insensitive" as const } },
        { conditionNotes: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
}

export function bookingItemSize(bi: { size?: string | null; item?: { size?: string | null } | null }): string {
  const sz = (bi.size || "").trim();
  if (sz) return sz;
  return (bi.item?.size || "").trim();
}

export function serializeBookingItems(
  booking: {
    dressName?: string | null;
    itemId?: number | null;
    legacyItem?: { category?: string | null; size?: string | null } | null;
    bookingItems?: Array<{
      dressName: string;
      category?: string | null;
      size?: string | null;
      item?: { size?: string | null } | null;
    }>;
  }
) {
  const items: Array<{ name: string; display_name: string; category: string; size: string }> = [];
  if (booking.bookingItems?.length) {
    for (const bi of booking.bookingItems) {
      const sz = bookingItemSize(bi);
      items.push({
        name: bi.dressName,
        display_name: dressDisplayName(bi.dressName, bi.category, sz),
        category: bi.category || "",
        size: sz,
      });
    }
  } else if (booking.dressName) {
    const cat = booking.legacyItem?.category || "";
    const sz = booking.legacyItem?.size || "";
    items.push({
      name: booking.dressName,
      display_name: dressDisplayName(booking.dressName, cat, sz),
      category: cat,
      size: sz || "",
    });
  }
  return items;
}

/** Comma-separated dress labels for list/table cells (includes legacy single-item bookings). */
export function bookingDressLabels(
  booking: Parameters<typeof serializeBookingItems>[0],
  fallback = "—"
): string {
  const labels = serializeBookingItems(booking).map((i) => i.display_name || i.name).filter(Boolean);
  return labels.length ? labels.join(", ") : fallback;
}

export type BookingItemPricingRow = {
  id?: number;
  display_name: string;
  category: string;
  price: number;
  advance: number;
  remaining: number;
  notes: string;
};

/** Item rows with pricing for detail views (multi-item + legacy bookings). */
export function serializeBookingItemRows(
  booking: {
    dressName?: string | null;
    itemId?: number | null;
    price?: number;
    advance?: number;
    remaining?: number;
    notes?: string | null;
    totalPrice?: number;
    totalAdvance?: number;
    totalRemaining?: number;
    legacyItem?: { category?: string | null; size?: string | null } | null;
    bookingItems?: Array<{
      id?: number;
      dressName: string;
      category?: string | null;
      size?: string | null;
      price: number;
      advance: number;
      remaining: number;
      notes?: string | null;
      item?: { size?: string | null } | null;
    }>;
  }
): BookingItemPricingRow[] {
  if (booking.bookingItems?.length) {
    const items = booking.bookingItems;
    return items.map((bi) => ({
      id: bi.id,
      display_name: dressDisplayName(bi.dressName, bi.category, bookingItemSize(bi)),
      category: bi.category || "",
      price: bi.price,
      advance: bi.advance,
      remaining: bi.remaining,
      notes: bi.notes?.trim() || (items.length === 1 ? booking.notes || "" : "") || "",
    }));
  }
  if (booking.dressName) {
    const cat = booking.legacyItem?.category || "";
    return [{
      display_name: dressDisplayName(booking.dressName, cat, booking.legacyItem?.size),
      category: cat,
      price: booking.price ?? booking.totalPrice ?? 0,
      advance: booking.advance ?? booking.totalAdvance ?? 0,
      remaining: booking.remaining ?? booking.totalRemaining ?? 0,
      notes: booking.notes || "",
    }];
  }
  return [];
}
