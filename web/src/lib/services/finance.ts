import prisma, { dateQ } from "../prisma";
import {
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
  parseDate,
} from "../constants";
import {
  getRefundsBetween,
  refundByCategory,
  refundGenderTotals,
  subtractRefundsFromCategories,
  totalRefundAmount,
} from "../financeRefunds";

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

export async function getDailySale(targetDateStr: string) {
  const target = parseDate(targetDateStr);
  const dayStartQ = startOfDayQ(target);
  const dayEndQ = endOfDayQ(target);

  const bookingsToday = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      createdAt: { gte: dayStartQ, lt: dayEndQ },
    },
    include: { bookingItems: true },
  });

  const deliveredToday = await prisma.booking.findMany({
    where: {
      deliveryDate: { gte: dayStartQ, lt: dayEndQ },
      status: { in: ["delivered", "returned"] },
    },
    include: { bookingItems: true },
  });

  const advance_by_category: Record<string, number> = {};
  const remaining_by_category: Record<string, number> = {};
  let advance_mens = 0, advance_womens = 0, advance_jewellery = 0;
  let remaining_mens = 0, remaining_womens = 0, remaining_jewellery = 0;

  for (const b of bookingsToday) {
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        advance_by_category[cat] = (advance_by_category[cat] || 0) + bi.advance;
        if (BASE_MENS.includes(cat)) advance_mens += bi.advance;
        else if (BASE_WOMENS.includes(cat)) advance_womens += bi.advance;
        else if (BASE_JEWELLERY.includes(cat)) advance_jewellery += bi.advance;
      }
    } else {
      advance_by_category["Other"] = (advance_by_category["Other"] || 0) + (b.totalAdvance || b.advance);
    }
  }

  for (const b of deliveredToday) {
    const remaining_amt = b.remainingCollected || 0;
    if (remaining_amt <= 0) continue;
    if (b.bookingItems.length && b.totalRemaining) {
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        const share = remaining_amt * (bi.remaining / b.totalRemaining);
        remaining_by_category[cat] = (remaining_by_category[cat] || 0) + share;
        if (BASE_MENS.includes(cat)) remaining_mens += share;
        else if (BASE_WOMENS.includes(cat)) remaining_womens += share;
        else if (BASE_JEWELLERY.includes(cat)) remaining_jewellery += share;
      }
    } else if (!b.bookingItems.length) {
      remaining_by_category["Other"] = (remaining_by_category["Other"] || 0) + remaining_amt;
    }
  }

  const total_advance = Object.values(advance_by_category).reduce((a, b) => a + b, 0);
  const total_remaining_collected = Object.values(remaining_by_category).reduce((a, b) => a + b, 0);

  const refundsToday = await getRefundsBetween(dayStartQ, dayEndQ);
  const refund_total = totalRefundAmount(refundsToday);
  const refundCats = refundByCategory(refundsToday);
  const refundGender = refundGenderTotals(refundCats);

  advance_mens -= refundGender.mens;
  advance_womens -= refundGender.womens;
  advance_jewellery -= refundGender.jewellery;

  return {
    date: target.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    advance_by_category,
    remaining_by_category,
    total_advance,
    total_remaining_collected,
    total_sale: total_advance + total_remaining_collected - refund_total,
    refund_total,
    refund_by_category: refundCats,
    advance_mens,
    advance_womens,
    advance_jewellery,
    remaining_mens,
    remaining_womens,
    remaining_jewellery,
  };
}

export async function getDailyBooking(targetDateStr: string) {
  const target = parseDate(targetDateStr);
  const dayStartQ = startOfDayQ(target);
  const dayEndQ = endOfDayQ(target);

  const bookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" }, createdAt: { gte: dayStartQ, lt: dayEndQ } },
    include: { bookingItems: true },
  });

  const total_by_category: Record<string, number> = {};
  let mens_total = 0, womens_total = 0, jewellery_total = 0;

  for (const b of bookings) {
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        const cat = bi.category || "Other";
        total_by_category[cat] = (total_by_category[cat] || 0) + bi.price;
        if (BASE_MENS.includes(cat)) mens_total += bi.price;
        else if (BASE_WOMENS.includes(cat)) womens_total += bi.price;
        else if (BASE_JEWELLERY.includes(cat)) jewellery_total += bi.price;
      }
    } else {
      total_by_category["Other"] = (total_by_category["Other"] || 0) + (b.totalPrice || b.price);
    }
  }

  const grand = Object.values(total_by_category).reduce((a, b) => a + b, 0);
  const refundsToday = await getRefundsBetween(dayStartQ, dayEndQ);
  const refund_total = totalRefundAmount(refundsToday);
  const refundCats = refundByCategory(refundsToday);
  const refundGender = refundGenderTotals(refundCats);

  return {
    date: target.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    total_by_category: subtractRefundsFromCategories(total_by_category, refundCats),
    grand_total: grand - refund_total,
    refund_total,
    mens_total: mens_total - refundGender.mens,
    womens_total: womens_total - refundGender.womens,
    jewellery_total: jewellery_total - refundGender.jewellery,
  };
}

export async function getMonthlySale(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const monthStart = dateQ(new Date(Date.UTC(year, month - 1, 1)));
  const monthEnd = dateQ(new Date(Date.UTC(year, month, 1)));

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    include: { bookingItems: true },
  });

  const total_advance = bookings.reduce((s, b) => s + (b.totalAdvance || b.advance), 0);
  const total_remaining = bookings.reduce((s, b) => s + (b.totalRemaining || b.remaining), 0);
  let mens_total = 0, womens_total = 0, jewellery_total = 0;

  for (const b of bookings) {
    for (const bi of b.bookingItems) {
      if (BASE_MENS.includes(bi.category || "")) mens_total += bi.price;
      else if (BASE_WOMENS.includes(bi.category || "")) womens_total += bi.price;
      else if (BASE_JEWELLERY.includes(bi.category || "")) jewellery_total += bi.price;
    }
  }

  const refundsMonth = await getRefundsBetween(monthStart, monthEnd);
  const refund_total = totalRefundAmount(refundsMonth);
  const refundGender = refundGenderTotals(refundByCategory(refundsMonth));

  return {
    month: monthStr,
    total_advance: total_advance - refund_total,
    total_remaining,
    total_sale: total_advance + total_remaining - refund_total,
    refund_total,
    booking_count: bookings.length,
    mens_total: mens_total - refundGender.mens,
    womens_total: womens_total - refundGender.womens,
    jewellery_total: jewellery_total - refundGender.jewellery,
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

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      createdAt: { gte: dateQ(fromDate), lte: endOfDayQ(toDate) },
    },
    include: { bookingItems: true },
  });

  const total_advance = bookings.reduce((s, b) => s + (b.totalAdvance || b.advance), 0);
  const total_remaining = bookings.reduce((s, b) => s + (b.totalRemaining || b.remaining), 0);
  const monthly_breakdown: Record<string, number> = {};
  const category_totals: Record<string, number> = {};
  let mens_total = 0, womens_total = 0, jewellery_total = 0;

  for (const b of bookings) {
    const mKey = b.createdAt.toISOString().slice(0, 7);
    monthly_breakdown[mKey] = (monthly_breakdown[mKey] || 0) + (b.totalPrice || b.price);
    for (const bi of b.bookingItems) {
      const cat = bi.category || "Other";
      category_totals[cat] = (category_totals[cat] || 0) + bi.price;
      if (BASE_MENS.includes(cat)) mens_total += bi.price;
      else if (BASE_WOMENS.includes(cat)) womens_total += bi.price;
      else if (BASE_JEWELLERY.includes(cat)) jewellery_total += bi.price;
    }
  }

  const refundsRange = await getRefundsBetween(dateQ(fromDate), endOfDayQ(toDate));
  const refund_total = totalRefundAmount(refundsRange);
  const refundGender = refundGenderTotals(refundByCategory(refundsRange));

  return {
    from: dateOnly(fromDate),
    to: dateOnly(toDate),
    total_advance: total_advance - refund_total,
    total_remaining,
    total_sale: total_advance + total_remaining - refund_total,
    refund_total,
    monthly_breakdown,
    category_totals,
    mens_total: mens_total - refundGender.mens,
    womens_total: womens_total - refundGender.womens,
    jewellery_total: jewellery_total - refundGender.jewellery,
    booking_count: bookings.length,
  };
}

export async function getTopPerformers(fromStr: string, toStr: string, categoryFilter = "") {
  const fromDate = parseDate(fromStr || new Date().toISOString().slice(0, 10));
  const toDate = parseDate(toStr || new Date().toISOString().slice(0, 10));

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      createdAt: { gte: dateQ(fromDate), lte: endOfDayQ(toDate) },
    },
    include: { bookingItems: { include: { item: true } } },
  });

  const product_stats: Record<string, {
    name: string;
    category: string;
    size: string;
    photo: string;
    bookings: number;
    total_earned: number;
  }> = {};

  for (const b of bookings) {
    for (const bi of b.bookingItems) {
      if (categoryFilter && bi.category !== categoryFilter) continue;
      const key = String(bi.itemId);
      if (!product_stats[key]) {
        product_stats[key] = {
          name: bi.dressName,
          category: bi.category || "",
          size: bi.item?.size || bi.size || "",
          photo: bi.item?.photo || "",
          bookings: 0,
          total_earned: 0,
        };
      }
      product_stats[key].bookings += 1;
      product_stats[key].total_earned += bi.price;
    }
  }

  const refunds = await getRefundsBetween(dateQ(fromDate), endOfDayQ(toDate));
  for (const b of refunds) {
    const amt = b.refundAmount || 0;
    const total = b.totalPrice || b.price || 0;
    if (amt <= 0 || total <= 0) continue;
    for (const bi of b.bookingItems) {
      if (categoryFilter && bi.category !== categoryFilter) continue;
      const key = String(bi.itemId);
      if (product_stats[key]) {
        product_stats[key].total_earned -= amt * (bi.price / total);
      }
    }
  }

  return Object.values(product_stats).sort((a, b) => b.total_earned - a.total_earned);
}

export async function getSecurityDepositSummary() {
  const bookings = await prisma.booking.findMany({
    where: {
      securityCollected: { gt: 0 },
      status: { in: ["delivered", "returned", "incomplete_return"] },
    },
    include: { bookingItems: true },
    orderBy: { deliveredAt: "desc" },
  });

  const total_collected = bookings.reduce((s, b) => s + (b.securityCollected || 0), 0);
  const total_held = bookings
    .filter((b) => b.status === "incomplete_return")
    .reduce((s, b) => s + (b.securityHeld || 0), 0);

  return {
    total_collected,
    total_held,
    total_returned: total_collected - total_held,
    bookings: bookings.map((b) => ({
      id: b.id,
      customer_name: b.customerName,
      serial: b.monthlySerial,
      security_collected: b.securityCollected,
      security_held: b.securityHeld,
      status: b.status,
      delivered_at: b.deliveredAt?.toISOString() || null,
    })),
  };
}

export async function getCategoryAnalysis(fromStr: string, toStr: string) {
  const fromDate = parseDate(fromStr);
  const toDate = parseDate(toStr);
  const fromDateQ = dateQ(fromDate);
  const toDateQ = dateQ(toDate);

  const purchases = await prisma.supplierPurchase.findMany({
    where: { date: { gte: fromDateQ, lte: toDateQ } },
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

  const stockItems = await prisma.clothingItem.findMany();
  const stock_by_cat: Record<string, number> = {};
  for (const item of stockItems) {
    const cat = (item.category || "Uncategorized").trim() || "Uncategorized";
    stock_by_cat[cat] = (stock_by_cat[cat] || 0) + 1;
  }

  const bookingsCreated = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      createdAt: { gte: fromDateQ, lte: endOfDayQ(toDate) },
    },
    include: { bookingItems: true },
  });

  const advance_by_cat: Record<string, number> = {};
  for (const b of bookingsCreated) {
    if (b.bookingItems.length) {
      for (const bi of b.bookingItems) {
        const cat = (bi.category || "Uncategorized").trim() || "Uncategorized";
        advance_by_cat[cat] = (advance_by_cat[cat] || 0) + (bi.advance || 0);
      }
    } else {
      advance_by_cat["Uncategorized"] = (advance_by_cat["Uncategorized"] || 0) + (b.totalAdvance || b.advance || 0);
    }
  }

  const delivered = await prisma.booking.findMany({
    where: {
      deliveryDate: { gte: fromDateQ, lte: toDateQ },
      status: { in: ["delivered", "returned"] },
    },
    include: { bookingItems: true },
  });

  const remaining_by_cat: Record<string, number> = {};
  for (const b of delivered) {
    const remaining_amt = b.remainingCollected || 0;
    if (remaining_amt <= 0) continue;
    if (b.bookingItems.length && b.totalRemaining) {
      for (const bi of b.bookingItems) {
        const cat = (bi.category || "Uncategorized").trim() || "Uncategorized";
        const share = remaining_amt * ((bi.remaining || 0) / b.totalRemaining);
        remaining_by_cat[cat] = (remaining_by_cat[cat] || 0) + share;
      }
    } else if (!b.bookingItems.length) {
      remaining_by_cat["Uncategorized"] = (remaining_by_cat["Uncategorized"] || 0) + remaining_amt;
    }
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
      stock: stockItems.length,
      refunds: refund_total,
    },
  };
}
