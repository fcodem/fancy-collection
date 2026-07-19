import prisma from "./prisma";
import { balanceLeftToCollect } from "./bookingDetails";

export { CUSTOM_ORDERS_CATEGORY } from "./finance/constants";

export type OrderAmountRow = {
  cost: number;
  advance: number;
  advancePaymentMode?: string | null;
  balance: number;
  balanceCollected: number;
  collectPaymentMode?: string | null;
  status: string;
  refundAmount: number;
};

export type BookingWithOrders = { orders?: OrderAmountRow[]; advancePaymentMode?: string | null };

function activeOrders(b: BookingWithOrders): OrderAmountRow[] {
  return (b.orders || []).filter((o) => o.status === "active");
}

/** Total cost of active orders (booking-time contract value). */
export function orderCostAmount(b: BookingWithOrders): number {
  return activeOrders(b).reduce((s, o) => s + (o.cost || 0), 0);
}

export function totalOrderCost(bookings: BookingWithOrders[]): number {
  return bookings.reduce((s, b) => s + orderCostAmount(b), 0);
}

/** Order advance recognized at booking time (active orders only). */
export function orderAdvanceAmount(b: BookingWithOrders): number {
  return activeOrders(b).reduce((s, o) => s + (o.advance || 0), 0);
}

/** Order balance actually collected (active orders only). */
export function orderBalanceCollected(b: BookingWithOrders): number {
  return activeOrders(b).reduce((s, o) => s + (o.balanceCollected || 0), 0);
}

/** Money refunded for cancelled orders (advance + balance collected at cancel time). */
export function orderRefund(b: BookingWithOrders): number {
  return (b.orders || [])
    .filter((o) => o.status === "cancelled")
    .reduce((s, o) => s + (o.refundAmount || 0), 0);
}

/** Net order revenue recognized: advance + collected balance − refunds. */
export function orderNetRecognized(b: BookingWithOrders): number {
  return orderAdvanceAmount(b) + orderBalanceCollected(b) - orderRefund(b);
}

export function totalOrderNetRecognized(bookings: BookingWithOrders[]): number {
  return bookings.reduce((s, b) => s + orderNetRecognized(b), 0);
}

export function totalOrderAdvance(bookings: BookingWithOrders[]): number {
  return bookings.reduce((s, b) => s + orderAdvanceAmount(b), 0);
}

export function totalOrderBalanceCollected(bookings: BookingWithOrders[]): number {
  return bookings.reduce((s, b) => s + orderBalanceCollected(b), 0);
}

/** Split order ADVANCE (active orders) into cash/online using each order's
 *  advancePaymentMode, falling back to the booking's advance mode, then cash. */
export function orderAdvanceSplitByMode(
  bookings: BookingWithOrders[],
): { cash: number; online: number } {
  let cash = 0;
  let online = 0;
  for (const b of bookings) {
    for (const o of activeOrders(b)) {
      const amt = o.advance || 0;
      if (amt <= 0) continue;
      const mode = o.advancePaymentMode || b.advancePaymentMode || "cash";
      if (mode === "online") online += amt;
      else cash += amt;
    }
  }
  return { cash, online };
}

export type BookingAdvanceRow = {
  totalAdvance?: number;
  advance?: number;
  bookingItems: Array<{ advance: number }>;
};

export function bookingAdvanceAmount(b: BookingAdvanceRow): number {
  if (b.bookingItems?.length) {
    return b.bookingItems.reduce((s, bi) => s + (bi.advance || 0), 0);
  }
  return b.totalAdvance || b.advance || 0;
}

export type BookingBalanceRow = {
  remainingCollected?: number;
  totalRemaining?: number;
  remaining?: number;
  bookingItems: Array<{
    category?: string | null;
    remaining?: number;
    itemRemainingCollected?: number | null;
  }>;
};

/** Amount actually collected at delivery (item sum when items exist, else booking-level). */
export function balanceCollectedAtDelivery(b: BookingBalanceRow): number {
  if (b.bookingItems?.length) {
    return b.bookingItems.reduce((s, bi) => s + (bi.itemRemainingCollected || 0), 0);
  }
  return b.remainingCollected || 0;
}

/** Outstanding balance recognized at return (unpaid portion after delivery collection). */
export function balanceDueAtReturn(b: BookingBalanceRow): number {
  if (b.bookingItems?.length) {
    return b.bookingItems.reduce(
      (s, bi) => s + Math.max(0, (bi.remaining || 0) - (bi.itemRemainingCollected || 0)),
      0,
    );
  }
  const total = b.totalRemaining ?? b.remaining ?? 0;
  return balanceLeftToCollect(total, b.remainingCollected);
}

export function totalBalanceReceivedFromDeliveries(bookings: BookingBalanceRow[]): number {
  return bookings.reduce((s, b) => s + balanceCollectedAtDelivery(b), 0);
}

export function totalBalanceReceivedAtReturn(bookings: BookingBalanceRow[]): number {
  return bookings.reduce((s, b) => s + balanceDueAtReturn(b), 0);
}

export function allocateBalanceByCategory(
  bookings: BookingBalanceRow[],
  mode: "delivery" | "return",
  defaultCategory = "Other",
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    if (b.bookingItems?.length) {
      for (const bi of b.bookingItems) {
        const cat = (bi.category || defaultCategory).trim() || defaultCategory;
        const amt =
          mode === "delivery"
            ? bi.itemRemainingCollected || 0
            : Math.max(0, (bi.remaining || 0) - (bi.itemRemainingCollected || 0));
        if (amt <= 0) continue;
        byCat[cat] = (byCat[cat] || 0) + amt;
      }
    } else {
      const amt =
        mode === "delivery"
          ? b.remainingCollected || 0
          : balanceDueAtReturn(b);
      if (amt <= 0) continue;
      byCat[defaultCategory] = (byCat[defaultCategory] || 0) + amt;
    }
  }
  return byCat;
}

export function allocateAdvanceByCategory(
  bookings: Array<{
    totalAdvance?: number;
    advance?: number;
    bookingItems: Array<{ advance: number; category?: string | null }>;
  }>,
  defaultCategory = "Other",
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    if (b.bookingItems?.length) {
      for (const bi of b.bookingItems) {
        if ((bi.advance || 0) <= 0) continue;
        const cat = (bi.category || defaultCategory).trim() || defaultCategory;
        byCat[cat] = (byCat[cat] || 0) + bi.advance;
      }
    } else {
      const amt = b.totalAdvance || b.advance || 0;
      if (amt <= 0) continue;
      byCat[defaultCategory] = (byCat[defaultCategory] || 0) + amt;
    }
  }
  return byCat;
}

/** Count dresses/items where balance was collected (delivery or return). */
export function countBalanceItems(bookings: BookingBalanceRow[], mode: "delivery" | "return"): number {
  let count = 0;
  for (const b of bookings) {
    if (b.bookingItems?.length) {
      for (const bi of b.bookingItems) {
        const amt =
          mode === "delivery"
            ? bi.itemRemainingCollected || 0
            : Math.max(0, (bi.remaining || 0) - (bi.itemRemainingCollected || 0));
        if (amt > 0) count += 1;
      }
    } else {
      const amt = mode === "delivery" ? b.remainingCollected || 0 : balanceDueAtReturn(b);
      if (amt > 0) count += 1;
    }
  }
  return count;
}

/** Count dresses/items booked, grouped by category. */
export function countDressesBookedByCategory(
  bookings: { bookingItems?: { category?: string | null }[]; dressName?: string | null }[],
  defaultCategory = "Other",
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    if (b.bookingItems?.length) {
      for (const bi of b.bookingItems) {
        const cat = (bi.category || defaultCategory).trim() || defaultCategory;
        byCat[cat] = (byCat[cat] || 0) + 1;
      }
    } else if (b.dressName) {
      byCat[defaultCategory] = (byCat[defaultCategory] || 0) + 1;
    }
  }
  return byCat;
}

/** Count dresses/items delivered, grouped by category. */
export function countDeliveredByCategory(
  bookings: BookingBalanceRow[],
  defaultCategory = "Other",
): Record<string, number> {
  const byCat: Record<string, number> = {};
  for (const b of bookings) {
    if (b.bookingItems?.length) {
      for (const bi of b.bookingItems) {
        const cat = (bi.category || defaultCategory).trim() || defaultCategory;
        byCat[cat] = (byCat[cat] || 0) + 1;
      }
    } else {
      byCat[defaultCategory] = (byCat[defaultCategory] || 0) + 1;
    }
  }
  return byCat;
}

export type TopPerformerBookingRow = BookingAdvanceRow & {
  status: string;
  createdAt: Date;
  deliveryDate?: Date | null;
  deliveredAt?: Date | null;
  returnedAt?: Date | null;
  returnDate?: Date | null;
  postponedAt?: Date | null;
  refundedAt?: Date | null;
  refundAmount?: number;
};

export type TopPerformerItemRow = {
  advance: number;
  remaining: number;
  itemRemainingCollected?: number | null;
  isDelivered: boolean;
  deliveredAt?: Date | null;
  isReturned: boolean;
};

function dateInRange(d: Date | null | undefined, from: Date, to: Date): boolean {
  return !!d && d >= from && d <= to;
}

export function isDateInFinanceRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

/**
 * Dress earnings for top performer:
 * advance (on booking) + balance at delivery (if delivered) − refunded cancel advance − postponed advance + balance at return.
 */
export function itemTopPerformerEarning(
  booking: TopPerformerBookingRow,
  item: TopPerformerItemRow,
  from: Date,
  to: Date,
): number {
  let earn = 0;

  if (dateInRange(booking.createdAt, from, to)) {
    earn += item.advance || 0;
  }

  const deliveryEventDate = item.deliveredAt ?? booking.deliveryDate ?? booking.deliveredAt;
  if (item.isDelivered && dateInRange(deliveryEventDate, from, to)) {
    earn += item.itemRemainingCollected || 0;
  }

  const returnEventDate =
    booking.returnedAt ?? (item.isReturned ? booking.returnDate : null);
  const balanceAtReturn = Math.max(0, (item.remaining || 0) - (item.itemRemainingCollected || 0));
  if (item.isReturned && balanceAtReturn > 0 && dateInRange(returnEventDate, from, to)) {
    earn += balanceAtReturn;
  }

  if (booking.status === "postponed" && dateInRange(booking.postponedAt, from, to)) {
    earn -= item.advance || 0;
  }

  if (booking.status === "cancelled" && (booking.refundAmount || 0) > 0) {
    const cancelDate = booking.refundedAt ?? booking.createdAt;
    if (dateInRange(cancelDate, from, to)) {
      const totalAdv = bookingAdvanceAmount(booking);
      const share =
        totalAdv > 0
          ? (booking.refundAmount || 0) * ((item.advance || 0) / totalAdv)
          : 0;
      earn -= share;
    }
  }

  return earn;
}

/** Order balance actually collected within [from, to) (recognition at collection). */
export async function getOrderBalanceCollectedBetween(from: Date, to: Date): Promise<number> {
  const rows = await prisma.bookingOrder.findMany({
    where: { status: "active", collectedAt: { gte: from, lt: to } },
    select: { balanceCollected: true },
  });
  return rows.reduce((s, o) => s + (o.balanceCollected || 0), 0);
}

/** Lifecycle counts for custom orders within [from, to):
 *  - received: orders placed (createdAt)
 *  - delivered: orders handed over / balance collected (collectedAt)
 *  - cancelled: orders cancelled (cancelledAt) */
export async function getOrderLifecycleCounts(
  from: Date,
  to: Date,
): Promise<{ orders_received: number; orders_delivered: number; orders_cancelled: number }> {
  const [orders_received, orders_delivered, orders_cancelled] = await Promise.all([
    prisma.bookingOrder.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.bookingOrder.count({ where: { collectedAt: { gte: from, lt: to } } }),
    prisma.bookingOrder.count({ where: { cancelledAt: { gte: from, lt: to } } }),
  ]);
  return { orders_received, orders_delivered, orders_cancelled };
}

/** Order balance collected within [from, to), split by collect payment mode. */
export async function getOrderCollectionSplitBetween(
  from: Date,
  to: Date,
): Promise<{ cash: number; online: number }> {
  const rows = await prisma.bookingOrder.findMany({
    where: { status: "active", collectedAt: { gte: from, lt: to } },
    select: { balanceCollected: true, collectPaymentMode: true },
  });
  let cash = 0;
  let online = 0;
  for (const o of rows) {
    const amt = o.balanceCollected || 0;
    if (amt <= 0) continue;
    if (o.collectPaymentMode === "online") online += amt;
    else cash += amt;
  }
  return { cash, online };
}

/** Money refunded for orders cancelled within [from, to). */
export async function getOrderRefundsBetween(from: Date, to: Date): Promise<number> {
  const rows = await prisma.bookingOrder.findMany({
    where: { status: "cancelled", cancelledAt: { gte: from, lt: to }, refundAmount: { gt: 0 } },
    select: { refundAmount: true },
  });
  return rows.reduce((s, o) => s + (o.refundAmount || 0), 0);
}

/** Sum of advance from bookings postponed within [from, to). */
export async function getPostponedAdvanceBetween(from: Date, to: Date): Promise<number> {
  const postponed = await prisma.booking.findMany({
    where: { status: "postponed", postponedAt: { gte: from, lt: to } },
    include: { bookingItems: { select: { advance: true } } },
  });
  return postponed.reduce((sum, b) => sum + bookingAdvanceAmount(b), 0);
}
