import prisma from "./prisma";
import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "./constants";

type BookingWithItems = {
  refundAmount: number;
  totalPrice: number;
  price: number;
  bookingItems: Array<{ category: string | null; price: number }>;
};

export async function getRefundsBetween(from: Date, to: Date) {
  return prisma.booking.findMany({
    where: {
      status: "cancelled",
      refundAmount: { gt: 0 },
      refundedAt: { gte: from, lt: to },
    },
    include: { bookingItems: true },
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

export function refundGenderTotals(refundCats: Record<string, number>) {
  let mens = 0;
  let womens = 0;
  let jewellery = 0;
  for (const [cat, amt] of Object.entries(refundCats)) {
    if (BASE_MENS.includes(cat)) mens += amt;
    else if (BASE_WOMENS.includes(cat)) womens += amt;
    else if (BASE_JEWELLERY.includes(cat)) jewellery += amt;
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
