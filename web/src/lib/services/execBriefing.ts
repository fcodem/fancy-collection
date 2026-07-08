import prisma, { dateQ } from "../prisma";
import { activeBookingWhere } from "../bookingActiveStatus";
import { cachedQuery } from "../perfCache";
import {
  getDailySaleCached,
  getMonthlySaleCached,
  getYearlySaleCached,
  getInventoryProfitabilityCached,
  getTopPerformersCached,
  getCategoryAnalysisCached,
} from "./finance";
import { getDashboardData } from "./core";
import {
  buildBriefingSections,
  IDLE_LOOKBACK_DAYS,
  type BriefingMetrics,
  type BriefingSections,
} from "./execBriefingLogic";

/**
 * AI Daily Executive Briefing — READ ONLY.
 *
 * This module never mutates business data. It aggregates the EXISTING analytics
 * layer (finance + dashboard services) and hands the computed numbers to the
 * pure derivation logic in `execBriefingLogic.ts`. No external LLM is used and
 * no AI-generated SQL is executed.
 */

export {
  FORECAST_LABEL,
  IDLE_LOOKBACK_DAYS,
  buildBriefingSections,
  buildGreeting,
  buildKpis,
  buildFollowUps,
  deriveInsights,
  deriveRecommendations,
  deriveAlerts,
  deriveUpcoming,
  deriveForecasts,
  pctChange,
} from "./execBriefingLogic";
export type {
  AlertSeverity,
  BriefingMetrics,
  BriefingSections,
  Forecast,
  Insight,
  KpiCard,
  PriorityAlert,
  Recommendation,
  UpcomingEvent,
  FollowUpQuestion,
} from "./execBriefingLogic";

export interface ExecBriefing extends BriefingSections {
  generatedAt: string;
  dateIso: string;
  trend: { labels: string[]; values: number[] };
  meta: {
    durationMs: number;
    sources: string[];
    cached: boolean;
    generatedFor: string;
  };
}

export const BRIEFING_SOURCES = [
  "getDashboardData",
  "getDailySaleCached",
  "getMonthlySaleCached",
  "getYearlySaleCached",
  "getInventoryProfitabilityCached",
  "getTopPerformersCached",
  "getCategoryAnalysisCached",
  "getMonthCustomerMix",
] as const;

// ---------------------------------------------------------------------------
// Data aggregation (read-only; reuses existing cached analytics)
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Cheap, read-only customer mix for the month (no pricing logic). */
export async function getMonthCustomerMix(monthStartQ: Date, monthEndQ: Date) {
  return cachedQuery(
    ["exec-briefing-customer-mix", isoDate(monthStartQ)],
    async () => {
      const grouped = await prisma.booking.groupBy({
        by: ["customerName"],
        where: { ...activeBookingWhere(), createdAt: { gte: monthStartQ, lt: monthEndQ } },
        _count: { _all: true },
      });

      const names = grouped.map((g) => g.customerName).filter(Boolean);
      let topCustomer: { name: string; bookings: number } | null = null;
      for (const g of grouped) {
        if (!g.customerName) continue;
        if (!topCustomer || g._count._all > topCustomer.bookings) {
          topCustomer = { name: g.customerName, bookings: g._count._all };
        }
      }

      let repeatCustomers = 0;
      if (names.length) {
        const priorRows = await prisma.booking.findMany({
          where: {
            ...activeBookingWhere(),
            createdAt: { lt: monthStartQ },
            customerName: { in: names },
          },
          select: { customerName: true },
          distinct: ["customerName"],
        });
        repeatCustomers = new Set(priorRows.map((r) => r.customerName)).size;
      }

      return {
        topCustomer,
        repeatCustomers,
        newCustomers: Math.max(0, names.length - repeatCustomers),
      };
    },
    300,
  );
}

/** Build a small 6-month booking-value trend from the yearly monthly_breakdown. */
function buildMonthlyTrend(monthlyBreakdown: Record<string, number>): { labels: string[]; values: number[] } {
  const sorted = Object.entries(monthlyBreakdown)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6);
  const labels = sorted.map(([mKey]) => {
    const [y, mm] = mKey.split("-").map(Number);
    return new Date(Date.UTC(y, (mm || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  });
  const values = sorted.map(([, v]) => Math.round(v));
  return { labels, values };
}

async function collectBriefingData(
  dateIso: string,
): Promise<{ metrics: BriefingMetrics; trend: { labels: string[]; values: number[] } }> {
  const today = new Date(`${dateIso}T00:00:00.000Z`);
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const monthStr = dateIso.slice(0, 7);
  const monthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthStr = isoDate(lastMonthDate).slice(0, 7);
  const monthEndDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsedInMonth = today.getUTCDate();

  const idleFrom = isoDate(addDays(today, -IDLE_LOOKBACK_DAYS));
  const yearFrom = isoDate(addDays(today, -365));

  const [
    dashboard,
    todaySale,
    yesterdaySale,
    priorSale,
    monthSale,
    lastMonthSale,
    yearlySale,
    idleProfit,
    yearProfit,
    topPerformers,
    categoryAnalysis,
    customerMix,
  ] = await Promise.all([
    getDashboardData(),
    getDailySaleCached(dateIso),
    getDailySaleCached(isoDate(yesterday)),
    getDailySaleCached(isoDate(dayBefore)),
    getMonthlySaleCached(monthStr),
    getMonthlySaleCached(lastMonthStr),
    getYearlySaleCached(),
    getInventoryProfitabilityCached(idleFrom, dateIso),
    getInventoryProfitabilityCached(yearFrom, dateIso),
    getTopPerformersCached(isoDate(monthStartDate), dateIso),
    getCategoryAnalysisCached(isoDate(monthStartDate), dateIso),
    getMonthCustomerMix(dateQ(monthStartDate), dateQ(monthEndDate)),
  ]);

  // Inventory status counts from the idle-window snapshot (all items included).
  let availableItems = 0;
  let rentedItems = 0;
  let maintenanceItems = 0;
  for (const item of idleProfit.items) {
    if (item.status === "available") availableItems += 1;
    else if (item.status === "rented" || item.status === "booked") rentedItems += 1;
    else if (item.status === "maintenance" || item.status === "cleaning" || item.status === "repair") maintenanceItems += 1;
  }
  const totalItems = idleProfit.totals.itemCount;
  const itemsWithRevenue = idleProfit.totals.itemsWithRevenue;
  const utilizationPct = totalItems > 0 ? Math.round((itemsWithRevenue / totalItems) * 100) : 0;
  const idleItemCount = idleProfit.items.filter((i) => i.bookingCount === 0).length;

  const mostValuableRow = yearProfit.items.find((i) => i.lifetimeRevenue > 0) || null;
  const mostValuableItem = mostValuableRow
    ? { name: mostValuableRow.name, revenue: mostValuableRow.lifetimeRevenue }
    : null;

  // Top category (this month) by revenue share.
  const saleByCategory = monthSale.sale_by_category as Record<string, number>;
  const monthTotalSale = Object.values(saleByCategory).reduce((a, b) => a + b, 0);
  let topCategory: BriefingMetrics["topCategory"] = null;
  for (const [name, revenue] of Object.entries(saleByCategory)) {
    if (!topCategory || revenue > topCategory.revenue) {
      topCategory = { name, revenue, sharePct: monthTotalSale > 0 ? Math.round((revenue / monthTotalSale) * 100) : 0 };
    }
  }

  // Underutilized + low-stock categories from category analysis (this month).
  let underutilizedCategory: BriefingMetrics["underutilizedCategory"] = null;
  let lowStockCategory: BriefingMetrics["lowStockCategory"] = null;
  for (const c of categoryAnalysis.categories) {
    if (c.stock_count > 0) {
      if (!underutilizedCategory || c.total_sale < underutilizedCategory.revenue) {
        underutilizedCategory = { name: c.category, revenue: c.total_sale, stock: c.stock_count };
      }
      if (c.booking_count > 0 && c.stock_count <= 2) {
        if (!lowStockCategory || c.stock_count < lowStockCategory.stock) {
          lowStockCategory = { name: c.category, stock: c.stock_count, bookings: c.booking_count };
        }
      }
    }
  }

  const topDressRow = topPerformers[0] || null;
  const topDress = topDressRow
    ? { name: topDressRow.name, bookings: topDressRow.bookings, revenue: topDressRow.total_earned }
    : null;

  const monthBookingCount = monthSale.booking_count;
  const avgBookingValue = monthBookingCount > 0 ? Math.round(monthSale.total_sale / monthBookingCount) : 0;

  const historicalMonthly = Object.entries(yearlySale.monthly_breakdown as Record<string, number>)
    .filter(([mKey]) => mKey !== monthStr)
    .map(([, v]) => v);

  const metrics: BriefingMetrics = {
    yesterdayRevenue: yesterdaySale.total_sale,
    priorDayRevenue: priorSale.total_sale,
    todayRevenue: todaySale.total_sale,
    monthRevenue: monthSale.total_sale,
    lastMonthRevenue: lastMonthSale.total_sale,
    daysElapsedInMonth,
    daysInMonth,
    historicalMonthly,
    deliveriesToday: dashboard.today_stats.total_orders,
    returnsToday: dashboard.today_stats.returning,
    remainingToDeliver: dashboard.today_stats.all_undelivered,
    overdueReturns: dashboard.late_return_count,
    ordersDueSoon: dashboard.orders_due_soon_count,
    pendingPayments: Math.max(0, dashboard.stats.outstanding),
    totalItems,
    availableItems,
    rentedItems,
    maintenanceItems,
    itemsWithRevenue,
    utilizationPct,
    idleItemCount,
    idleLookbackDays: IDLE_LOOKBACK_DAYS,
    mostValuableItem,
    topCategory,
    underutilizedCategory,
    lowStockCategory,
    topDress,
    monthBookingCount,
    avgBookingValue,
    topCustomer: customerMix.topCustomer,
    repeatCustomers: customerMix.repeatCustomers,
    newCustomers: customerMix.newCustomers,
  };

  const trend = buildMonthlyTrend(yearlySale.monthly_breakdown as Record<string, number>);

  return { metrics, trend };
}

/** Aggregate only the pure metrics (used by callers/tests that don't need the trend). */
export async function collectBriefingMetrics(dateIso: string): Promise<BriefingMetrics> {
  const { metrics } = await collectBriefingData(dateIso);
  return metrics;
}

/**
 * Generate the full briefing for a given date + user. Read-only.
 * Returns the briefing plus the list of analytics sources used (for auditing).
 */
export async function generateExecBriefing(opts: {
  dateIso: string;
  userName: string;
  now?: Date;
}): Promise<ExecBriefing> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const { metrics, trend } = await collectBriefingData(opts.dateIso);
  const sections = buildBriefingSections(metrics, opts.userName, now);

  return {
    generatedAt: now.toISOString(),
    dateIso: opts.dateIso,
    ...sections,
    trend,
    meta: {
      durationMs: Date.now() - started,
      sources: [...BRIEFING_SOURCES],
      cached: false,
      generatedFor: opts.userName,
    },
  };
}
