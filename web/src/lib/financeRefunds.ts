import prisma from "./prisma";
import {
  financeItemDivision,
  financeItemCategoryKeyForBookingItem,
  type CategoryDivisionLists,
} from "./financeGenderTotals";

type BookingWithItems = {
  refundAmount: number | null;
  totalPrice: number | null;
  price: number | null;
  bookingItems: Array<{
    category: string | null;
    price: number;
    isCancelled?: boolean;
    cancelRefundAmount?: number | null;
    dressName?: string | null;
    item?: { category?: string | null; subCategory?: string | null } | null;
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
          dressName: true,
          item: { select: { category: true, subCategory: true } },
        },
      },
    },
  });
}

export function totalRefundAmount(bookings: BookingWithItems[]): number {
  return bookings.reduce((s, b) => s + (b.refundAmount || 0), 0);
}

export function refundByCategory(
  bookings: BookingWithItems[],
  lists?: CategoryDivisionLists,
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    const amt = b.refundAmount || 0;
    if (amt <= 0) continue;
    const total = b.totalPrice || b.price || 0;
    if (b.bookingItems.length && total > 0) {
      for (const bi of b.bookingItems) {
        const cat = financeItemCategoryKeyForBookingItem(bi, lists);
        byCat[cat] = (byCat[cat] || 0) + amt * (bi.price / total);
      }
    } else {
      byCat.womens = (byCat.womens || 0) + amt;
    }
  }
  return byCat;
}

export function refundGenderTotals(
  refundCats: Record<string, number>,
  lists?: CategoryDivisionLists,
) {
  let mens = 0;
  let womens = 0;
  let jewellery = 0;
  for (const [cat, amt] of Object.entries(refundCats)) {
    const div = financeItemDivision(cat, undefined, undefined, lists);
    if (div === "mens") mens += amt;
    else if (div === "womens") womens += amt;
    else jewellery += amt;
  }
  return { mens, womens, jewellery };
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
