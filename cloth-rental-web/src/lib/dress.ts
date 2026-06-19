export function dressNameWords(q: string): string[] {
  return (q || "").toLowerCase().split(/\s+/).filter((w) => w.length > 0);
}

export function dressNameMatches(text: string, q: string): boolean {
  const textL = (text || "").toLowerCase();
  const words = dressNameWords(q);
  if (!words.length) return true;
  return words.every((w) => textL.includes(w));
}

export function isSherwaniCategory(category?: string | null): boolean {
  return (category || "").trim().toLowerCase() === "sherwani";
}

export function dressDisplayName(
  name?: string | null,
  category?: string | null,
  size?: string | null
): string {
  const n = (name || "").trim();
  const cat = (category || "").trim();
  const sz = (size || "").trim();
  if (isSherwaniCategory(cat) && sz) {
    const low = n.toLowerCase();
    if (!low.includes(`size ${sz.toLowerCase()}`) && !n.includes(`(${sz})`) && !low.includes("· size")) {
      return `${n} · Size ${sz}`;
    }
  }
  return n;
}

/** Prisma where-clause builder: every word must match name, sku, or notes */
export function dressNamePrismaFilter(q: string) {
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
    item?: { category?: string; size?: string | null } | null;
    bookingItems?: Array<{
      dressName: string;
      category?: string | null;
      size?: string | null;
      item?: { size?: string | null } | null;
    }>;
  }
) {
  if (booking.bookingItems?.length) {
    return booking.bookingItems.map((bi) => {
      const sz = bookingItemSize(bi);
      return {
        name: bi.dressName,
        display_name: dressDisplayName(bi.dressName, bi.category, sz),
        category: bi.category || "",
        size: sz,
      };
    });
  }
  if (booking.dressName) {
    const cat = booking.item?.category || "";
    const sz = booking.item?.size || "";
    return [
      {
        name: booking.dressName,
        display_name: dressDisplayName(booking.dressName, cat, sz),
        category: cat,
        size: sz || "",
      },
    ];
  }
  return [];
}

/** Booking text search: customer fields OR dress name (any word order) */
export function bookingSearchWhere(queryText: string) {
  const q = queryText.trim();
  if (!q) return undefined;
  const words = dressNameWords(q);
  const identity = {
    OR: [
      { customerName: { contains: q, mode: "insensitive" as const } },
      { contact1: { contains: q, mode: "insensitive" as const } },
      { whatsappNo: { contains: q, mode: "insensitive" as const } },
      { bookingNumber: { contains: q, mode: "insensitive" as const } },
      { monthlySerial: { equals: parseInt(q, 10) || -1 } },
    ],
  };
  if (!words.length) return identity;
  const dressMatch = {
    AND: words.map((word) => ({
      OR: [
        { dressName: { contains: word, mode: "insensitive" as const } },
        {
          bookingItems: {
            some: { dressName: { contains: word, mode: "insensitive" as const } },
          },
        },
      ],
    })),
  };
  return { OR: [identity, dressMatch] };
}
