import prisma, { dateQ } from "../prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import {
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  formatDate,
  parseDate,
} from "../constants";
import { COMPLETED_BOOKING_STATUSES } from "../bookingLock";
import {
  getRefundsBetween,
  refundByCategory,
  refundGenderTotals,
  subtractRefundsFromCategories,
  totalRefundAmount,
} from "../financeRefunds";
import {
  allocateAdvanceByCategory,
  allocateBalanceByCategory,
  balanceCollectedAtDelivery,
  balanceDueAtReturn,
  bookingAdvanceAmount,
  countBalanceItems,
  countDeliveredByCategory,
  countDressesBookedByCategory,
  getPostponedAdvanceBetween,
  getOrderBalanceCollectedBetween,
  getOrderCollectionSplitBetween,
  getOrderLifecycleCounts,
  getOrderRefundsBetween,
  orderAdvanceSplitByMode,
  itemTopPerformerEarning,
  isDateInFinanceRange,
  totalBalanceReceivedAtReturn,
  totalBalanceReceivedFromDeliveries,
  totalOrderAdvance,
  totalOrderCost,
  CUSTOM_ORDERS_CATEGORY,
} from "../financeBookingAmounts";
import { getInactiveBookingStats } from "../financeInactiveBookings";
import { financeParallelLimit } from "../finance/financeApiRoute";
import { cachedQuery } from "../perfCache";
import { catalogPhotoRef } from "../catalogPhotoRef";

const financeOrderSelect = {
  select: {
    cost: true,
    advance: true,
    advancePaymentMode: true,
    balance: true,
    balanceCollected: true,
    collectPaymentMode: true,
    status: true,
    refundAmount: true,
  },
} as const;

const financeBookingInclude = {
  bookingItems: {
    select: {
      advance: true,
      category: true,
      price: true,
      remaining: true,
      itemRemainingCollected: true,
      itemId: true,
      dressName: true,
      size: true,
    },
  },
  orders: financeOrderSelect,
} as const;

/** Same booking rows without custom-order joins — used for delivery/return balance reads. */
const financeBookingIncludeLite = {
  bookingItems: financeBookingInclude.bookingItems,
} as const;

const financeBookingIncludeWithItem = {
  bookingItems: {
    select: {
      advance: true,
      category: true,
      price: true,
      remaining: true,
      itemId: true,
      dressName: true,
      size: true,
      item: { select: { size: true, photo: true } },
    },
  },
} as const;

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDay(d: Date): Date {
  const s = startOfDay(d);
  s.setUTCDate(s.getUTCDate() + 1);
  return s;
}

function startOfDayQ(d: Date): Date {
  return dateQ(startOfDay(d));
}

function endOfDayQ(d: Date): Date {
  return dateQ(endOfDay(d));
}

type BookingPaymentRow = {
  advancePaymentMode: string;
  remainingPaymentMode: string | null;
  totalAdvance?: number;
  advance?: number;
  remainingCollected?: number;
  totalRemaining?: number;
  remaining?: number;
  bookingItems: Array<{
    advance: number;
    category: string | null;
    remaining?: number;
    itemRemainingCollected?: number | null;
  }>;
};

function sumGenderFromCategories(byCat: Record<string, number>) {
  let mens = 0;
  let womens = 0;
  let jewellery = 0;
  for (const [cat, amt] of Object.entries(byCat)) {
    if (BASE_MENS.includes(cat)) mens += amt;
    else if (BASE_WOMENS.includes(cat)) womens += amt;
    else if (BASE_JEWELLERY.includes(cat)) jewellery += amt;
  }
  return { mens, womens, jewellery };
}

function mergeCategoryMaps(...maps: Record<string, number>[]) {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [cat, amt] of Object.entries(map)) {
      merged[cat] = (merged[cat] || 0) + amt;
    }
  }
  return merged;
}

function sumAdvanceByMode(bookings: BookingPaymentRow[]) {
  let cash = 0;
  let online = 0;
  for (const b of bookings) {
    const amt = b.bookingItems.length
      ? b.bookingItems.reduce((s, bi) => s + bi.advance, 0)
      : (b.totalAdvance || b.advance || 0);
    if (b.advancePaymentMode === "online") online += amt;
    else cash += amt;
  }
  return { cash, online };
}

function sumRemainingByMode(bookings: BookingPaymentRow[]) {
  let cash = 0;
  let online = 0;
  for (const b of bookings) {
    const amt = balanceCollectedAtDelivery(b);
    if (amt <= 0) continue;
    if (b.remainingPaymentMode === "online") online += amt;
    else cash += amt;
  }
  return { cash, online };
}

function sumReturnBalanceByMode(bookings: BookingPaymentRow[]) {
  let cash = 0;
  let online = 0;
  for (const b of bookings) {
    const amt = balanceDueAtReturn(b);
    if (amt <= 0) continue;
    if (b.remainingPaymentMode === "online") online += amt;
    else cash += amt;
  }
  return { cash, online };
}

export async function getDailySale(targetDateStr: string) {
  const target = parseDate(targetDateStr);
  const dayStartQ = startOfDayQ(target);
  const dayEndQ = endOfDayQ(target);

  const [
    bookingsToday,
    deliveredToday,
    returnedToday,
    refundsToday,
    inactive,
    order_balance_collected,
    order_refund,
    orderCollectionSplit,
  ] = await financeParallelLimit(
    () =>
      prisma.booking.findMany({
        where: {
          ...activeBookingWhere(),
          createdAt: { gte: dayStartQ, lt: dayEndQ },
        },
        include: financeBookingInclude,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: { in: ["delivered", "returned"] },
          OR: [
            { deliveredAt: { gte: dayStartQ, lt: dayEndQ } },
            { deliveredAt: null, deliveryDate: { gte: dayStartQ, lt: dayEndQ } },
          ],
        },
        include: financeBookingIncludeLite,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: "returned",
          returnedAt: { gte: dayStartQ, lt: dayEndQ },
        },
        include: financeBookingIncludeLite,
      }),
    () => getRefundsBetween(dayStartQ, dayEndQ),
    () => getInactiveBookingStats(dayStartQ, dayEndQ),
    () => getOrderBalanceCollectedBetween(dayStartQ, dayEndQ),
    () => getOrderRefundsBetween(dayStartQ, dayEndQ),
    () => getOrderCollectionSplitBetween(dayStartQ, dayEndQ),
  );

  const orderAdvanceSplit = orderAdvanceSplitByMode(bookingsToday);

  const advance_by_category: Record<string, number> = {};
  let advance_mens = 0, advance_womens = 0, advance_jewellery = 0;
  let advance_count = 0;

  for (const b of bookingsToday) {
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        if (bi.advance > 0) advance_count += 1;
        const cat = bi.category || "Other";
        advance_by_category[cat] = (advance_by_category[cat] || 0) + bi.advance;
        if (BASE_MENS.includes(cat)) advance_mens += bi.advance;
        else if (BASE_WOMENS.includes(cat)) advance_womens += bi.advance;
        else if (BASE_JEWELLERY.includes(cat)) advance_jewellery += bi.advance;
      }
    } else {
      if ((b.totalAdvance || b.advance) > 0) advance_count += 1;
      advance_by_category["Other"] = (advance_by_category["Other"] || 0) + (b.totalAdvance || b.advance);
    }
  }

  // Custom Orders: advance recognized at booking time (active orders created today).
  const order_advance = totalOrderAdvance(bookingsToday);
  if (order_advance > 0) {
    advance_by_category[CUSTOM_ORDERS_CATEGORY] =
      (advance_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_advance;
  }

  const delivery_by_category = allocateBalanceByCategory(deliveredToday, "delivery");
  const return_by_category = allocateBalanceByCategory(returnedToday, "return");
  const remaining_by_category = mergeCategoryMaps(delivery_by_category, return_by_category);
  // Custom Orders: balance recognized when collected today.
  if (order_balance_collected > 0) {
    remaining_by_category[CUSTOM_ORDERS_CATEGORY] =
      (remaining_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_balance_collected;
  }

  const deliverySplit = sumRemainingByMode(deliveredToday);
  const returnSplit = sumReturnBalanceByMode(returnedToday);
  const remaining_cash = deliverySplit.cash + returnSplit.cash + orderCollectionSplit.cash;
  const remaining_online = deliverySplit.online + returnSplit.online + orderCollectionSplit.online;

  const total_advance = Object.values(advance_by_category).reduce((a, b) => a + b, 0);
  const total_balance_at_delivery = Object.values(delivery_by_category).reduce((a, b) => a + b, 0);
  const total_balance_at_return = Object.values(return_by_category).reduce((a, b) => a + b, 0);
  const total_remaining_collected = total_balance_at_delivery + total_balance_at_return + order_balance_collected;
  const dressAdvanceSplit = sumAdvanceByMode(bookingsToday);
  const advance_cash = dressAdvanceSplit.cash + orderAdvanceSplit.cash;
  const advance_online = dressAdvanceSplit.online + orderAdvanceSplit.online;
  const payment_collected_cash = advance_cash + remaining_cash;
  const payment_collected_online = advance_online + remaining_online;

  const refund_total = totalRefundAmount(refundsToday);
  const refundCats = refundByCategory(refundsToday);
  const refundGender = refundGenderTotals(refundCats);

  advance_mens -= refundGender.mens;
  advance_womens -= refundGender.womens;
  advance_jewellery -= refundGender.jewellery;

  const deliveryGender = sumGenderFromCategories(delivery_by_category);
  const returnGender = sumGenderFromCategories(return_by_category);
  const remaining_mens = deliveryGender.mens + returnGender.mens;
  const remaining_womens = deliveryGender.womens + returnGender.womens;
  const remaining_jewellery = deliveryGender.jewellery + returnGender.jewellery;

  const balance_delivery_count = countBalanceItems(deliveredToday, "delivery");
  const balance_return_count = countBalanceItems(returnedToday, "return");
  const balance_count = balance_delivery_count + balance_return_count;

  const category_booking_counts: Record<string, number> = {};
  for (const b of bookingsToday) {
    if (b.bookingItems.length) {
      const catsInBooking = new Set<string>();
      for (const bi of b.bookingItems) {
        catsInBooking.add(bi.category || "Other");
      }
      for (const cat of catsInBooking) {
        category_booking_counts[cat] = (category_booking_counts[cat] || 0) + 1;
      }
    } else {
      category_booking_counts["Other"] = (category_booking_counts["Other"] || 0) + 1;
    }
  }
  const category_delivered_counts = countDeliveredByCategory(deliveredToday);
  const dresses_by_category = countDressesBookedByCategory(bookingsToday);
  const dresses_booked = Object.values(dresses_by_category).reduce((a, b) => a + b, 0);
  let orders_booked = 0;
  for (const b of bookingsToday) {
    orders_booked += (b.orders || []).filter((o) => o.status === "active").length;
  }
  const balance_by_category = remaining_by_category;

  return {
    date: target.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    advance_by_category,
    delivery_by_category,
    return_by_category,
    remaining_by_category,
    balance_by_category,
    category_booking_counts,
    category_delivered_counts,
    dresses_by_category,
    dresses_booked,
    booking_count: bookingsToday.length,
    total_advance,
    total_balance_at_delivery,
    total_balance_at_return,
    total_remaining_collected,
    advance_count,
    balance_count,
    balance_delivery_count,
    balance_return_count,
    advance_cash,
    advance_online,
    remaining_cash,
    remaining_online,
    payment_collected_cash,
    payment_collected_online,
    order_advance,
    order_balance_collected,
    order_refund,
    orders_booked,
    total_sale: total_advance + total_remaining_collected - refund_total - order_refund,
    refund_total,
    refund_by_category: refundCats,
    advance_mens,
    advance_womens,
    advance_jewellery,
    remaining_mens,
    remaining_womens,
    remaining_jewellery,
    ...inactive,
  };
}

export async function getDailyBooking(targetDateStr: string) {
  const target = parseDate(targetDateStr);
  const dayStartQ = startOfDayQ(target);
  const dayEndQ = endOfDayQ(target);

  const [bookings, deliveredToday] = await financeParallelLimit(
    () =>
      prisma.booking.findMany({
        where: { ...activeBookingWhere(), createdAt: { gte: dayStartQ, lt: dayEndQ } },
        include: financeBookingInclude,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: { in: ["delivered", "returned"] },
          OR: [
            { deliveredAt: { gte: dayStartQ, lt: dayEndQ } },
            { deliveredAt: null, deliveryDate: { gte: dayStartQ, lt: dayEndQ } },
          ],
        },
        include: financeBookingIncludeLite,
      }),
  );

  const total_by_category: Record<string, number> = {};
  const dresses_by_category: Record<string, number> = {};
  let mens_total = 0, womens_total = 0, jewellery_total = 0;
  let dresses_booked = 0;

  for (const b of bookings) {
    if (b.bookingItems.length) {
      dresses_booked += b.bookingItems.length;
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        dresses_by_category[cat] = (dresses_by_category[cat] || 0) + 1;
        total_by_category[cat] = (total_by_category[cat] || 0) + bi.price;
        if (BASE_MENS.includes(cat)) mens_total += bi.price;
        else if (BASE_WOMENS.includes(cat)) womens_total += bi.price;
        else if (BASE_JEWELLERY.includes(cat)) jewellery_total += bi.price;
      }
    } else {
      dresses_booked += 1;
      dresses_by_category["Other"] = (dresses_by_category["Other"] || 0) + 1;
      total_by_category["Other"] = (total_by_category["Other"] || 0) + (b.totalPrice || b.price);
    }
  }

  let dresses_delivered_balance = 0;
  for (const b of deliveredToday) {
    if (b.bookingItems.length) {
      dresses_delivered_balance += b.bookingItems.filter((bi) => (bi.itemRemainingCollected || 0) > 0).length;
    } else if ((b.remainingCollected || 0) > 0) {
      dresses_delivered_balance += 1;
    }
  }

  // Custom Orders booked today are tracked separately from the dress booking amount.
  const order_cost = totalOrderCost(bookings);
  let orders_booked = 0;
  for (const b of bookings) {
    orders_booked += (b.orders || []).filter((o) => o.status === "active").length;
  }

  const dressGrand = Object.values(total_by_category).reduce((a, b) => a + b, 0);
  const refundsToday = await getRefundsBetween(dayStartQ, dayEndQ);
  const refund_total = totalRefundAmount(refundsToday);
  const refundCats = refundByCategory(refundsToday);
  const refundGender = refundGenderTotals(refundCats);
  const inactive = await getInactiveBookingStats(dayStartQ, dayEndQ);

  const booking_amount = dressGrand - refund_total;
  const grand_total = booking_amount + order_cost;

  return {
    date: target.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    total_by_category: subtractRefundsFromCategories(total_by_category, refundCats),
    booking_amount,
    order_cost,
    orders_booked,
    grand_total,
    refund_total,
    dresses_booked,
    dresses_delivered_balance,
    dresses_by_category,
    mens_total: mens_total - refundGender.mens,
    womens_total: womens_total - refundGender.womens,
    jewellery_total: jewellery_total - refundGender.jewellery,
    ...inactive,
  };
}

export async function getMonthlySale(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));

  const [
    bookings,
    deliveredInMonth,
    returnedInMonth,
    refundsMonth,
    postponed_advance,
    order_balance_collected,
    order_refund,
    orderCounts,
    orderCollectionSplit,
  ] = await financeParallelLimit(
    () =>
      prisma.booking.findMany({
        where: {
          ...activeBookingWhere(),
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        include: financeBookingInclude,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: { in: ["delivered", "returned"] },
          OR: [
            { deliveredAt: { gte: monthStart, lt: monthEnd } },
            { deliveredAt: null, deliveryDate: { gte: monthStart, lt: monthEnd } },
          ],
        },
        include: financeBookingIncludeLite,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: "returned",
          returnedAt: { gte: monthStart, lt: monthEnd },
        },
        include: financeBookingIncludeLite,
      }),
    () => getRefundsBetween(monthStart, monthEnd),
    () => getPostponedAdvanceBetween(monthStart, monthEnd),
    () => getOrderBalanceCollectedBetween(monthStart, monthEnd),
    () => getOrderRefundsBetween(monthStart, monthEnd),
    () => getOrderLifecycleCounts(monthStart, monthEnd),
    () => getOrderCollectionSplitBetween(monthStart, monthEnd),
  );

  const advanceSplit = sumAdvanceByMode(bookings);
  const deliverySplit = sumRemainingByMode(deliveredInMonth);
  const returnSplit = sumReturnBalanceByMode(returnedInMonth);
  const orderAdvanceSplit = orderAdvanceSplitByMode(bookings);

  const gross_advance = bookings.reduce((s, b) => s + bookingAdvanceAmount(b), 0);
  const advance_refunded = totalRefundAmount(refundsMonth);
  const order_advance = totalOrderAdvance(bookings);
  const order_cost = totalOrderCost(bookings);
  const orders_booked = bookings.reduce(
    (s, b) => s + (b.orders || []).filter((o) => o.status === "active").length,
    0,
  );
  const balance_delivery_count = countBalanceItems(deliveredInMonth, "delivery");
  const balance_return_count = countBalanceItems(returnedInMonth, "return");
  const total_advance = gross_advance - advance_refunded - postponed_advance + order_advance;
  const total_balance_at_delivery = totalBalanceReceivedFromDeliveries(deliveredInMonth);
  const total_balance_at_return = totalBalanceReceivedAtReturn(returnedInMonth);
  const total_balance_received = total_balance_at_delivery + total_balance_at_return + order_balance_collected;
  const total_remaining = total_balance_received;
  const category_totals: Record<string, number> = {};
  const category_booking_counts: Record<string, number> = {};
  let advance_count = 0;

  for (const b of bookings) {
    if (b.bookingItems.length) {
      const catsInBooking = new Set<string>();
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        catsInBooking.add(cat);
        category_totals[cat] = (category_totals[cat] || 0) + bi.price;
        if (bi.advance > 0) advance_count += 1;
      }
      for (const cat of catsInBooking) {
        category_booking_counts[cat] = (category_booking_counts[cat] || 0) + 1;
      }
    } else {
      category_booking_counts["Other"] = (category_booking_counts["Other"] || 0) + 1;
      if ((b.totalAdvance || b.advance) > 0) advance_count += 1;
      category_totals["Other"] = (category_totals["Other"] || 0) + (b.totalPrice || b.price);
    }
  }

  const refund_total = advance_refunded;
  const refundCats = refundByCategory(refundsMonth);
  const category_totals_net = subtractRefundsFromCategories(category_totals, refundCats);
  const advance_by_category = subtractRefundsFromCategories(
    allocateAdvanceByCategory(bookings),
    refundCats,
  );
  const category_delivered_counts = countDeliveredByCategory(deliveredInMonth);
  const dresses_delivered = Object.values(category_delivered_counts).reduce((a, b) => a + b, 0);
  const dresses_by_category = countDressesBookedByCategory(bookings);
  const dresses_booked = Object.values(dresses_by_category).reduce((a, b) => a + b, 0);
  const balance_by_category = mergeCategoryMaps(
    allocateBalanceByCategory(deliveredInMonth, "delivery"),
    allocateBalanceByCategory(returnedInMonth, "return"),
  );
  if (order_cost > 0) {
    category_totals_net[CUSTOM_ORDERS_CATEGORY] = (category_totals_net[CUSTOM_ORDERS_CATEGORY] || 0) + order_cost;
  }
  if (order_advance > 0) {
    advance_by_category[CUSTOM_ORDERS_CATEGORY] = (advance_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_advance;
  }
  if (order_balance_collected > 0) {
    balance_by_category[CUSTOM_ORDERS_CATEGORY] = (balance_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_balance_collected;
  }
  const sale_by_category = mergeCategoryMaps(advance_by_category, balance_by_category);
  const saleGender = sumGenderFromCategories(sale_by_category);
  const inactive = await getInactiveBookingStats(monthStart, monthEnd);

  return {
    month: monthStr,
    gross_advance,
    advance_refunded,
    postponed_advance,
    total_advance,
    total_balance_at_delivery,
    total_balance_at_return,
    total_balance_received,
    total_remaining,
    advance_cash: advanceSplit.cash + orderAdvanceSplit.cash,
    advance_online: advanceSplit.online + orderAdvanceSplit.online,
    remaining_cash: deliverySplit.cash + returnSplit.cash + orderCollectionSplit.cash,
    remaining_online: deliverySplit.online + returnSplit.online + orderCollectionSplit.online,
    payment_collected_cash: advanceSplit.cash + orderAdvanceSplit.cash + deliverySplit.cash + returnSplit.cash + orderCollectionSplit.cash,
    payment_collected_online: advanceSplit.online + orderAdvanceSplit.online + deliverySplit.online + returnSplit.online + orderCollectionSplit.online,
    order_advance,
    order_cost,
    orders_booked,
    orders_received: orderCounts.orders_received,
    orders_delivered: orderCounts.orders_delivered,
    orders_cancelled: orderCounts.orders_cancelled,
    order_balance_collected,
    order_refund,
    balance_delivery_count,
    balance_return_count,
    total_sale: total_advance + total_balance_received - order_refund,
    refund_total,
    booking_count: bookings.length,
    advance_count,
    dresses_delivered,
    dresses_by_category,
    dresses_booked,
    advance_by_category,
    balance_by_category,
    category_delivered_counts,
    category_totals: category_totals_net,
    category_booking_counts,
    sale_by_category,
    mens_total: saleGender.mens,
    womens_total: saleGender.womens,
    jewellery_total: saleGender.jewellery,
    ...inactive,
  };
}

export async function getYearlySale(fromStr?: string, toStr?: string) {
  let fromDate: Date;
  let toDate: Date;
  const today = new Date();

  if (fromStr && toStr) {
    fromDate = parseDate(fromStr);
    toDate = parseDate(toStr);
  } else if (today.getUTCMonth() + 1 >= 4) {
    fromDate = new Date(Date.UTC(today.getUTCFullYear(), 3, 1));
    toDate = new Date(Date.UTC(today.getUTCFullYear() + 1, 2, 31));
  } else {
    fromDate = new Date(Date.UTC(today.getUTCFullYear() - 1, 3, 1));
    toDate = new Date(Date.UTC(today.getUTCFullYear(), 2, 31));
  }

  const rangeStart = dateQ(fromDate);
  const rangeEnd = endOfDayQ(toDate);

  const [
    bookings,
    deliveredInPeriod,
    returnedInPeriod,
    refundsRange,
    postponed_advance,
    order_balance_collected,
    order_refund,
    orderCounts,
    orderCollectionSplit,
  ] = await financeParallelLimit(
    () =>
      prisma.booking.findMany({
        where: {
          ...activeBookingWhere(),
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
        include: financeBookingInclude,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: { in: ["delivered", "returned"] },
          OR: [
            { deliveredAt: { gte: rangeStart, lte: rangeEnd } },
            { deliveredAt: null, deliveryDate: { gte: rangeStart, lte: rangeEnd } },
          ],
        },
        include: financeBookingIncludeLite,
      }),
    () =>
      prisma.booking.findMany({
        where: {
          status: "returned",
          returnedAt: { gte: rangeStart, lte: rangeEnd },
        },
        include: financeBookingIncludeLite,
      }),
    () => getRefundsBetween(rangeStart, rangeEnd),
    () => getPostponedAdvanceBetween(rangeStart, rangeEnd),
    () => getOrderBalanceCollectedBetween(rangeStart, rangeEnd),
    () => getOrderRefundsBetween(rangeStart, rangeEnd),
    () => getOrderLifecycleCounts(rangeStart, rangeEnd),
    () => getOrderCollectionSplitBetween(rangeStart, rangeEnd),
  );

  const gross_advance = bookings.reduce((s, b) => s + bookingAdvanceAmount(b), 0);
  const advance_refunded = totalRefundAmount(refundsRange);
  const order_advance = totalOrderAdvance(bookings);
  const order_cost = totalOrderCost(bookings);
  const orders_booked = bookings.reduce(
    (s, b) => s + (b.orders || []).filter((o) => o.status === "active").length,
    0,
  );
  const balance_delivery_count = countBalanceItems(deliveredInPeriod, "delivery");
  const balance_return_count = countBalanceItems(returnedInPeriod, "return");
  const advanceSplit = sumAdvanceByMode(bookings);
  const deliverySplit = sumRemainingByMode(deliveredInPeriod);
  const returnSplit = sumReturnBalanceByMode(returnedInPeriod);
  const orderAdvanceSplit = orderAdvanceSplitByMode(bookings);
  const total_advance = gross_advance - advance_refunded - postponed_advance + order_advance;
  const total_balance_at_delivery = totalBalanceReceivedFromDeliveries(deliveredInPeriod);
  const total_balance_at_return = totalBalanceReceivedAtReturn(returnedInPeriod);
  const total_balance_received = total_balance_at_delivery + total_balance_at_return + order_balance_collected;
  const total_remaining = total_balance_received;
  const monthly_breakdown: Record<string, number> = {};
  const category_totals: Record<string, number> = {};
  const category_booking_counts: Record<string, number> = {};
  let advance_count = 0;

  for (const b of bookings) {
    const mKey = b.createdAt.toISOString().slice(0, 7);
    monthly_breakdown[mKey] = (monthly_breakdown[mKey] || 0) + (b.totalPrice || b.price);
    if (b.bookingItems.length) {
      const catsInBooking = new Set<string>();
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        catsInBooking.add(cat);
        category_totals[cat] = (category_totals[cat] || 0) + bi.price;
        if (bi.advance > 0) advance_count += 1;
      }
      for (const cat of catsInBooking) {
        category_booking_counts[cat] = (category_booking_counts[cat] || 0) + 1;
      }
    } else {
      category_booking_counts["Other"] = (category_booking_counts["Other"] || 0) + 1;
      if ((b.totalAdvance || b.advance) > 0) advance_count += 1;
      category_totals["Other"] = (category_totals["Other"] || 0) + (b.totalPrice || b.price);
    }
  }

  const refund_total = advance_refunded;
  const refundCats = refundByCategory(refundsRange);
  const advance_by_category = subtractRefundsFromCategories(
    allocateAdvanceByCategory(bookings),
    refundCats,
  );
  const category_delivered_counts = countDeliveredByCategory(deliveredInPeriod);
  const dresses_delivered = Object.values(category_delivered_counts).reduce((a, b) => a + b, 0);
  const dresses_by_category = countDressesBookedByCategory(bookings);
  const dresses_booked = Object.values(dresses_by_category).reduce((a, b) => a + b, 0);
  const balance_by_category = mergeCategoryMaps(
    allocateBalanceByCategory(deliveredInPeriod, "delivery"),
    allocateBalanceByCategory(returnedInPeriod, "return"),
  );
  if (order_cost > 0) {
    category_totals[CUSTOM_ORDERS_CATEGORY] = (category_totals[CUSTOM_ORDERS_CATEGORY] || 0) + order_cost;
  }
  if (order_advance > 0) {
    advance_by_category[CUSTOM_ORDERS_CATEGORY] = (advance_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_advance;
  }
  if (order_balance_collected > 0) {
    balance_by_category[CUSTOM_ORDERS_CATEGORY] = (balance_by_category[CUSTOM_ORDERS_CATEGORY] || 0) + order_balance_collected;
  }
  const sale_by_category = mergeCategoryMaps(advance_by_category, balance_by_category);
  const saleGender = sumGenderFromCategories(sale_by_category);
  const inactive = await getInactiveBookingStats(rangeStart, rangeEnd);

  return {
    from: dateOnly(fromDate),
    to: dateOnly(toDate),
    gross_advance,
    advance_refunded,
    postponed_advance,
    total_advance,
    total_balance_at_delivery,
    total_balance_at_return,
    total_balance_received,
    total_remaining,
    order_advance,
    order_cost,
    orders_booked,
    orders_received: orderCounts.orders_received,
    orders_delivered: orderCounts.orders_delivered,
    orders_cancelled: orderCounts.orders_cancelled,
    order_balance_collected,
    order_refund,
    balance_delivery_count,
    balance_return_count,
    advance_cash: advanceSplit.cash + orderAdvanceSplit.cash,
    advance_online: advanceSplit.online + orderAdvanceSplit.online,
    remaining_cash: deliverySplit.cash + returnSplit.cash + orderCollectionSplit.cash,
    remaining_online: deliverySplit.online + returnSplit.online + orderCollectionSplit.online,
    payment_collected_cash: advanceSplit.cash + orderAdvanceSplit.cash + deliverySplit.cash + returnSplit.cash + orderCollectionSplit.cash,
    payment_collected_online: advanceSplit.online + orderAdvanceSplit.online + deliverySplit.online + returnSplit.online + orderCollectionSplit.online,
    total_sale: total_advance + total_balance_received - order_refund,
    refund_total,
    monthly_breakdown,
    category_totals,
    advance_by_category,
    balance_by_category,
    sale_by_category,
    category_booking_counts,
    category_delivered_counts,
    dresses_delivered,
    dresses_by_category,
    dresses_booked,
    mens_total: saleGender.mens,
    womens_total: saleGender.womens,
    jewellery_total: saleGender.jewellery,
    booking_count: bookings.length,
    advance_count,
    ...inactive,
  };
}

export async function getTopPerformers(
  fromStr: string,
  toStr: string,
  categoryFilter = "",
  dressSearch = "",
) {
  const fromDate = parseDate(fromStr || new Date().toISOString().slice(0, 10));
  const toDate = parseDate(toStr || new Date().toISOString().slice(0, 10));
  const fromQ = dateQ(fromDate);
  const toQ = endOfDayQ(toDate);

  const bookingItems = await prisma.bookingItem.findMany({
    where: {
      ...(categoryFilter ? { category: categoryFilter } : {}),
      booking: {
        OR: [
          { createdAt: { gte: fromQ, lte: toQ } },
          { deliveryDate: { gte: fromQ, lte: toQ } },
          { deliveredAt: { gte: fromQ, lte: toQ } },
          { returnedAt: { gte: fromQ, lte: toQ } },
          { returnDate: { gte: fromQ, lte: toQ } },
          { postponedAt: { gte: fromQ, lte: toQ } },
          { refundedAt: { gte: fromQ, lte: toQ } },
        ],
      },
    },
    include: {
      item: { select: { size: true, photo: true } },
      booking: {
        select: {
          status: true,
          createdAt: true,
          deliveryDate: true,
          deliveredAt: true,
          returnedAt: true,
          returnDate: true,
          postponedAt: true,
          refundedAt: true,
          refundAmount: true,
          totalAdvance: true,
          advance: true,
          bookingItems: { select: { advance: true } },
        },
      },
    },
  });

  const product_stats: Record<string, {
    name: string;
    category: string;
    size: string;
    photo: string;
    bookings: number;
    total_earned: number;
  }> = {};

  for (const bi of bookingItems) {
    const b = bi.booking;
    const key = String(bi.itemId);
    if (!product_stats[key]) {
      product_stats[key] = {
        name: bi.dressName,
        category: bi.category || "",
        size: bi.item?.size || bi.size || "",
        photo: bi.item ? catalogPhotoRef(bi.item) : "",
        bookings: 0,
        total_earned: 0,
      };
    }

    const earned = itemTopPerformerEarning(
      b,
      {
        advance: bi.advance,
        remaining: bi.remaining,
        itemRemainingCollected: bi.itemRemainingCollected,
        isDelivered: bi.isDelivered,
        deliveredAt: bi.deliveredAt,
        isReturned: bi.isReturned,
      },
      fromQ,
      toQ,
    );

    if (isDateInFinanceRange(b.createdAt, fromQ, toQ)) {
      product_stats[key].bookings += 1;
    }
    product_stats[key].total_earned += earned;
  }

  const dressQuery = dressSearch.trim().toLowerCase();
  let results = Object.values(product_stats)
    .filter((r) => r.total_earned > 0 || r.bookings > 0)
    .sort((a, b) => b.total_earned - a.total_earned);
  if (dressQuery) {
    results = results.filter((r) => r.name.toLowerCase().includes(dressQuery));
  }
  return results.slice(0, 100);
}

export async function getSecurityDepositSummary(fromStr?: string, toStr?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = parseDate(fromStr || today.slice(0, 8) + "01");
  const toDate = parseDate(toStr || today);
  const fromDateQ = dateQ(fromDate);
  const toDateQ = endOfDayQ(toDate);

  const bookings = await prisma.booking.findMany({
    where: {
      securityCollected: { gt: 0 },
      status: { in: ["delivered", "returned", "incomplete_return"] },
      OR: [
        { deliveredAt: { gte: fromDateQ, lte: toDateQ } },
        { deliveredAt: null, createdAt: { gte: fromDateQ, lte: toDateQ } },
      ],
    },
    include: { bookingItems: true },
    orderBy: { deliveredAt: "desc" },
  });

  const total_collected = bookings.reduce((s, b) => s + (b.securityCollected || 0), 0);
  const total_held = bookings.reduce((s, b) => {
    if (b.status === "returned" || b.status === "cancelled" || b.status === "postponed") return s;
    if (b.status === "incomplete_return") return s + (b.securityHeld || b.securityCollected || 0);
    if (b.status === "delivered") return s + (b.securityHeld || b.securityCollected || 0);
    return s;
  }, 0);

  return {
    from: dateOnly(fromDate),
    to: dateOnly(toDate),
    total_collected,
    total_held,
    total_returned: total_collected - total_held,
    bookings: bookings.map((b) => ({
      id: b.id,
      customer_name: b.customerName,
      serial: b.monthlySerial,
      security_collected: b.securityCollected,
      security_held:
        b.status === "delivered" || b.status === "incomplete_return"
          ? b.securityHeld || b.securityCollected || 0
          : b.securityHeld || 0,
      status: b.status,
      delivered_at: b.deliveredAt?.toISOString() || null,
      returned_at: b.returnedAt?.toISOString() || null,
      delivery_date: b.deliveredAt
        ? formatDate(b.deliveredAt, "display")
        : formatDate(b.createdAt, "display"),
      return_date: b.returnedAt ? formatDate(b.returnedAt, "display") : "",
    })),
  };
}

export async function getCategoryAnalysis(fromStr: string, toStr: string) {
  const fromDate = parseDate(fromStr);
  const toDate = parseDate(toStr);
  const fromDateQ = dateQ(fromDate);

  const purchases = await prisma.supplierPurchase.findMany({
    where: { date: { gte: fromDateQ, lte: endOfDayQ(toDate) } },
  });

  const purchase_by_cat: Record<string, number> = {};
  const returns_by_cat: Record<string, number> = {};
  const gst_by_cat: Record<string, number> = {};

  for (const p of purchases) {
    const cat = (p.category || "Uncategorized").trim() || "Uncategorized";
    if (p.transactionType === "return") {
      returns_by_cat[cat] = (returns_by_cat[cat] || 0) + p.amount;
    } else {
      purchase_by_cat[cat] = (purchase_by_cat[cat] || 0) + p.amount;
      gst_by_cat[cat] = (gst_by_cat[cat] || 0) + (p.gstAmount || 0);
    }
  }

  const stockByCat = await prisma.clothingItem.groupBy({
    by: ["category"],
    _count: { _all: true },
  });
  const stock_by_cat: Record<string, number> = {};
  for (const row of stockByCat) {
    const cat = (row.category || "Uncategorized").trim() || "Uncategorized";
    stock_by_cat[cat] = row._count._all;
  }

  const bookingsCreated = await prisma.booking.findMany({
    where: {
      ...activeBookingWhere(),
      createdAt: { gte: fromDateQ, lte: endOfDayQ(toDate) },
    },
    include: financeBookingInclude,
  });

  const advance_by_cat: Record<string, number> = {};
  const booking_count_by_cat: Record<string, number> = {};
  for (const b of bookingsCreated) {
    if (b.bookingItems.length) {
      const catsInBooking = new Set<string>();
      for (const bi of b.bookingItems) {
        const cat = (bi.category || "Uncategorized").trim() || "Uncategorized";
        catsInBooking.add(cat);
        advance_by_cat[cat] = (advance_by_cat[cat] || 0) + (bi.advance || 0);
      }
      for (const cat of catsInBooking) {
        booking_count_by_cat[cat] = (booking_count_by_cat[cat] || 0) + 1;
      }
    } else {
      advance_by_cat["Uncategorized"] = (advance_by_cat["Uncategorized"] || 0) + (b.totalAdvance || b.advance || 0);
      booking_count_by_cat["Uncategorized"] = (booking_count_by_cat["Uncategorized"] || 0) + 1;
    }
  }

  const delivered = await prisma.booking.findMany({
    where: {
      status: { in: ["delivered", "returned"] },
      OR: [
        { deliveredAt: { gte: fromDateQ, lte: endOfDayQ(toDate) } },
        { deliveredAt: null, deliveryDate: { gte: fromDateQ, lte: endOfDayQ(toDate) } },
      ],
    },
    include: financeBookingIncludeLite,
  });

  const returned = await prisma.booking.findMany({
    where: {
      status: "returned",
      returnedAt: { gte: fromDateQ, lte: endOfDayQ(toDate) },
    },
    include: financeBookingIncludeLite,
  });

  const delivery_by_cat = allocateBalanceByCategory(delivered, "delivery", "Uncategorized");
  const return_by_cat = allocateBalanceByCategory(returned, "return", "Uncategorized");
  const remaining_by_cat = mergeCategoryMaps(delivery_by_cat, return_by_cat);

  // Custom Orders category: advance at booking, balance when collected.
  const order_advance = totalOrderAdvance(bookingsCreated);
  const order_balance_collected = await getOrderBalanceCollectedBetween(fromDateQ, endOfDayQ(toDate));
  if (order_advance > 0) {
    advance_by_cat[CUSTOM_ORDERS_CATEGORY] = (advance_by_cat[CUSTOM_ORDERS_CATEGORY] || 0) + order_advance;
    booking_count_by_cat[CUSTOM_ORDERS_CATEGORY] =
      (booking_count_by_cat[CUSTOM_ORDERS_CATEGORY] || 0) +
      bookingsCreated.filter((b) => (b.orders || []).some((o) => o.status === "active")).length;
  }
  if (order_balance_collected > 0) {
    remaining_by_cat[CUSTOM_ORDERS_CATEGORY] = (remaining_by_cat[CUSTOM_ORDERS_CATEGORY] || 0) + order_balance_collected;
  }

  const allCats = new Set([
    ...Object.keys(purchase_by_cat),
    ...Object.keys(advance_by_cat),
    ...Object.keys(remaining_by_cat),
    ...Object.keys(stock_by_cat),
  ]);

  const refundsRange = await getRefundsBetween(fromDateQ, endOfDayQ(toDate));
  const refundCats = refundByCategory(refundsRange);
  const refund_total = totalRefundAmount(refundsRange);

  const categories = [...allCats].sort().map((cat) => {
    const advance = (advance_by_cat[cat] || 0) - (refundCats[cat] || 0);
    const remaining_collected = remaining_by_cat[cat] || 0;
    return {
      category: cat,
      purchases: purchase_by_cat[cat] || 0,
      returns: returns_by_cat[cat] || 0,
      net_purchase: (purchase_by_cat[cat] || 0) - (returns_by_cat[cat] || 0),
      gst: gst_by_cat[cat] || 0,
      stock_count: stock_by_cat[cat] || 0,
      booking_count: booking_count_by_cat[cat] || 0,
      advance,
      remaining_collected,
      total_sale: advance + remaining_collected,
    };
  });

  return {
    from: dateOnly(fromDate),
    to: dateOnly(toDate),
    categories,
    totals: {
      purchases: Object.values(purchase_by_cat).reduce((a, b) => a + b, 0),
      advance: Object.values(advance_by_cat).reduce((a, b) => a + b, 0) - refund_total,
      remaining: Object.values(remaining_by_cat).reduce((a, b) => a + b, 0),
      stock: Object.values(stock_by_cat).reduce((a, b) => a + b, 0),
      refunds: refund_total,
    },
  };
}

export type InventoryProfitabilityRow = {
  rank: number;
  itemId: number;
  sku: string;
  name: string;
  category: string;
  size: string | null;
  photo: string | null;
  status: string;
  bookingCount: number;
  lifetimeRevenue: number;
};

/**
 * Rental revenue per inventory item from completed bookings in a date range.
 * Revenue is attributed by booking return date (fallback: booking created date).
 * Purchases use supplier_purchases.date in the same range.
 */
export async function getInventoryProfitability(fromStr?: string, toStr?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = parseDate(fromStr || today.slice(0, 8) + "01");
  const toDate = parseDate(toStr || today);
  const fromDateQ = dateQ(fromDate);
  const toDateQ = endOfDayQ(toDate);

  const completedStatuses = [...COMPLETED_BOOKING_STATUSES];
  const bookingDateFilter = {
    status: { in: completedStatuses },
    OR: [
      { returnedAt: { gte: fromDateQ, lte: toDateQ } },
      { returnedAt: null, createdAt: { gte: fromDateQ, lte: toDateQ } },
    ],
  };

  const modernAgg = await prisma.bookingItem.groupBy({
    by: ["itemId"],
    where: {
      booking: bookingDateFilter,
    },
    _sum: { price: true },
    _count: { _all: true },
  });

  const legacyBookings = await prisma.booking.findMany({
    where: {
      ...bookingDateFilter,
      itemId: { not: null },
      bookingItems: { none: {} },
    },
    select: { itemId: true, totalPrice: true, price: true },
  });

  const revenueByItem = new Map<number, { revenue: number; bookings: number }>();

  for (const row of modernAgg) {
    if (row.itemId == null) continue;
    revenueByItem.set(row.itemId, {
      revenue: row._sum.price ?? 0,
      bookings: row._count._all,
    });
  }

  for (const b of legacyBookings) {
    if (!b.itemId) continue;
    const amount = b.totalPrice || b.price || 0;
    const existing = revenueByItem.get(b.itemId) ?? { revenue: 0, bookings: 0 };
    revenueByItem.set(b.itemId, {
      revenue: existing.revenue + amount,
      bookings: existing.bookings + 1,
    });
  }

  const allItems = await prisma.clothingItem.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      size: true,
      photo: true,
      status: true,
    },
  });

  const items: InventoryProfitabilityRow[] = allItems
    .map((item) => {
      const stats = revenueByItem.get(item.id);
      return {
        rank: 0,
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        size: item.size,
        photo: catalogPhotoRef(item),
        status: item.status,
        bookingCount: stats?.bookings ?? 0,
        lifetimeRevenue: stats?.revenue ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.lifetimeRevenue - a.lifetimeRevenue ||
        b.bookingCount - a.bookingCount ||
        a.name.localeCompare(b.name),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const totalRevenue = items.reduce((sum, row) => sum + row.lifetimeRevenue, 0);

  const purchases = await prisma.supplierPurchase.findMany({
    where: {
      transactionType: { not: "return" },
      date: { gte: fromDateQ, lte: toDateQ },
    },
    select: { category: true, amount: true },
  });
  const returns = await prisma.supplierPurchase.findMany({
    where: {
      transactionType: "return",
      date: { gte: fromDateQ, lte: toDateQ },
    },
    select: { category: true, amount: true },
  });

  const saleByCategory: Record<string, number> = {};
  const purchaseByCategory: Record<string, number> = {};
  const itemCountByCategory: Record<string, number> = {};

  for (const row of items) {
    const cat = (row.category || "Uncategorized").trim() || "Uncategorized";
    saleByCategory[cat] = (saleByCategory[cat] || 0) + row.lifetimeRevenue;
    itemCountByCategory[cat] = (itemCountByCategory[cat] || 0) + 1;
  }
  for (const p of purchases) {
    const cat = (p.category || "Uncategorized").trim() || "Uncategorized";
    purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + p.amount;
  }
  for (const p of returns) {
    const cat = (p.category || "Uncategorized").trim() || "Uncategorized";
    purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) - p.amount;
  }

  const allCats = new Set([...Object.keys(saleByCategory), ...Object.keys(purchaseByCategory)]);
  const category_breakdown = [...allCats].sort().map((category) => ({
    category,
    total_sale: saleByCategory[category] || 0,
    total_purchase: purchaseByCategory[category] || 0,
    item_count: itemCountByCategory[category] || 0,
  }));

  return {
    from: dateOnly(fromDate),
    to: dateOnly(toDate),
    items,
    category_breakdown,
    totals: {
      itemCount: items.length,
      itemsWithRevenue: items.filter((row) => row.lifetimeRevenue > 0).length,
      totalRevenue,
      totalBookings: items.reduce((sum, row) => sum + row.bookingCount, 0),
    },
  };
}

export function getInventoryProfitabilityCached(fromStr?: string, toStr?: string) {
  const from = fromStr || "";
  const to = toStr || "";
  return cachedQuery(
    ["finance-inventory-profitability", from, to],
    () => getInventoryProfitability(fromStr, toStr),
    120,
  );
}

export function getDailySaleCached(targetDateStr: string) {
  return cachedQuery(["finance-daily-sale", "v4", targetDateStr], () => getDailySale(targetDateStr), 300);
}

export function getDailyBookingCached(targetDateStr: string) {
  return cachedQuery(["finance-daily-booking", "v3", targetDateStr], () => getDailyBooking(targetDateStr), 300);
}

export function getMonthlySaleCached(monthStr: string) {
  return cachedQuery(["finance-monthly-sale", "v4", monthStr], () => getMonthlySale(monthStr), 300);
}

export function getYearlySaleCached(fromStr?: string, toStr?: string) {
  const key = `v4:${fromStr || ""}:${toStr || ""}`;
  return cachedQuery(["finance-yearly-sale", key], () => getYearlySale(fromStr, toStr), 240);
}

export function getTopPerformersCached(
  fromStr: string,
  toStr: string,
  categoryFilter = "",
  dressSearch = "",
) {
  return cachedQuery(
    ["finance-top-performer", "v2", fromStr, toStr, categoryFilter, dressSearch],
    () => getTopPerformers(fromStr, toStr, categoryFilter, dressSearch),
    180,
  );
}

export function getCategoryAnalysisCached(fromStr: string, toStr: string) {
  return cachedQuery(
    ["finance-category-analysis", "v3", fromStr, toStr],
    () => getCategoryAnalysis(fromStr, toStr),
    300,
  );
}

export function getSecurityDepositSummaryCached(fromStr?: string, toStr?: string) {
  const from = fromStr || "";
  const to = toStr || "";
  return cachedQuery(
    ["finance-security-deposit", from, to],
    () => getSecurityDepositSummary(fromStr, toStr),
    60,
  );
}
