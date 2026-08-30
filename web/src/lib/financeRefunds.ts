import prisma from "./prisma";

type BookingWithItems = {
  refundAmount: number | null;
  totalPrice: number | null;
  price: number | null;
  bookingItems: Array<{
    category: string | null;
    price: number;
    isCancelled?: boolean;
    cancelRefundAmount?: number | null;
  }>;
};

export async function getRefundsBetween(from: Date, to: Date) {
  return prisma.booking.findMany({
    where: {
      refundAmount: { gt: 0 },
      refundedAt: { gte: from, lt: to },
      OR: [
        { status: "cancelled" },
        // Partial dress cancel with advance refunded while booking stays active
        { bookingItems: { some: { isCancelled: true, cancelRefundAmount: { gt: 0 } } } },
      ],
    },
    include: {
      bookingItems: {
        select: {
          category: true,
          price: true,
          isCancelled: true,
          cancelRefundAmount: true,
        },
      },
    },
  });
}

export function totalRefundAmount(bookings: BookingWithItems[]): number {
  return bookings.reduce((s, b) => s + (b.refundAmount || 0), 0);
}

export function refundByCategory(bookings: BookingWithItems[]): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    const amt = b.refundAmount || 0;
    if (amt <= 0) continue;
    const total = b.totalPrice || b.price || 0;
    if (b.bookingItems.length && total > 0) {
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        byCat[cat] = (byCat[cat] || 0) + amt * (bi.price / total);
      }
    } else {
      byCat["Other"] = (byCat["Other"] || 0) + amt;
    }
  }
  return byCat;
}

import { financeItemDivision } from "./financeGenderTotals";

export function refundGenderTotals(refundCats: Record<string, number>) {
  let mens = 0;
  let womens = 0;
  let jewellery = 0;
  let other = 0;
  for (const [cat, amt] of Object.entries(refundCats)) {
    const div = financeItemDivision(cat);
    if (div === "mens") mens += amt;
    else if (div === "womens") womens += amt;
    else if (div === "jewellery") jewellery += amt;
    else other += amt;
  }
  return { mens, womens, jewellery, other };
}

/** Subtract refund map from a category totals map (mutates nothing). */
export function subtractRefundsFromCategories(
  totals: Record<string, number>,
  refunds: Record<string, number>
): Record<string, number> {
  const out = { ...totals };
  for (const [cat, amt] of Object.entries(refunds)) {
    out[cat] = (out[cat] || 0) - amt;
  }
  return out;
}
