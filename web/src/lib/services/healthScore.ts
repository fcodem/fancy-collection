import { dateQ } from "../prisma";
import {
  getMonthlySaleCached,
  getInventoryProfitabilityCached,
} from "./finance";
import { getDashboardData } from "./core";
import { getMonthCustomerMix } from "./execBriefing";
import {
  computeHealthScore,
  pctChangeSafe,
  type HealthMetrics,
  type HealthScoreResult,
} from "./healthScoreLogic";

/**
 * AI Business Health Score — READ ONLY aggregator.
 *
 * Reuses the existing analytics layer (finance + dashboard services) to build a
 * `HealthMetrics` object, then hands it to the pure `computeHealthScore` logic.
 * No business data is ever mutated and no new expensive queries duplicate the
 * finance engine — all heavy analytics come from the cached finance services.
 */

export interface HealthScorePoint {
  label: string;
  score: number;
}

export interface HealthScoreReport extends HealthScoreResult {
  generatedAt: string;
  dateIso: string;
  history: { labels: string[]; values: number[] };
  meta: {
    durationMs: number;
    sources: string[];
    cached: boolean;
    generatedFor: string;
    weightTotal: number;
  };
}

export const HEALTH_SOURCES = [
  "getDashboardData",
  "getInventoryProfitabilityCached",
  "getMonthlySaleCached",
  "getMonthCustomerMix",
] as const;

const IDLE_LOOKBACK_DAYS = 180;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Current-state inventory + operations context, fetched once and shared across horizons. */
interface SharedContext {
  totalItems: number;
  availableItems: number;
  maintenanceItems: number;
  itemsWithRevenue: number;
  idleItemCount: number;
  utilizationPct: number;
  availabilityPct: number;
  idleRatioPct: number;
  maintenanceRatioPct: number;
  overdueReturns: number;
  dressesDeliveredContext: number;
  outstanding: number;
}

async function gatherSharedContext(dateIso: string): Promise<SharedContext> {
  const today = new Date(`${dateIso}T00:00:00.000Z`);
  const idleFrom = isoDate(addDays(today, -IDLE_LOOKBACK_DAYS));

  const [inventory, dashboard] = await Promise.all([
    getInventoryProfitabilityCached(idleFrom, dateIso),
    getDashboardData(),
  ]);

  let availableItems = 0;
  let maintenanceItems = 0;
  for (const item of inventory.items) {
    if (item.status === "available") availableItems += 1;
    else if (item.status === "maintenance" || item.status === "cleaning" || item.status === "repair") maintenanceItems += 1;
  }
  const totalItems = inventory.totals.itemCount;
  const itemsWithRevenue = inventory.totals.itemsWithRevenue;
  const idleItemCount = inventory.items.filter((i) => i.bookingCount === 0).length;
  const safeTotal = Math.max(1, totalItems);

  return {
    totalItems,
    availableItems,
    maintenanceItems,
    itemsWithRevenue,
    idleItemCount,
    utilizationPct: totalItems > 0 ? (itemsWithRevenue / totalItems) * 100 : 0,
    availabilityPct: (availableItems / safeTotal) * 100,
    idleRatioPct: (idleItemCount / safeTotal) * 100,
    maintenanceRatioPct: (maintenanceItems / safeTotal) * 100,
    overdueReturns: dashboard.late_return_count,
    dressesDeliveredContext: dashboard.today_stats.total_orders,
    outstanding: Math.max(0, dashboard.stats.outstanding),
  };
}

/** Build HealthMetrics for a given date, reusing the shared current-state context. */
async function collectHealthMetrics(dateIso: string, shared: SharedContext): Promise<HealthMetrics> {
  const today = new Date(`${dateIso}T00:00:00.000Z`);
  const monthStr = dateIso.slice(0, 7);
  const monthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEndDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const lastMonthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthStr = isoDate(lastMonthDate).slice(0, 7);
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = Math.min(today.getUTCDate(), daysInMonth);

  const [monthSale, lastMonthSale, customerMix] = await Promise.all([
    getMonthlySaleCached(monthStr),
    getMonthlySaleCached(lastMonthStr),
    getMonthCustomerMix(dateQ(monthStartDate), dateQ(monthEndDate)),
  ]);

  const projectedMonth = daysElapsed > 0 ? (monthSale.total_sale / daysElapsed) * daysInMonth : monthSale.total_sale;
  const revenueGrowthPct = pctChangeSafe(projectedMonth, lastMonthSale.total_sale);
  const bookingGrowthPct = pctChangeSafe(monthSale.booking_count, lastMonthSale.booking_count);

  const monthRevenue = monthSale.total_sale;
  const outstandingRatio = shared.outstanding / Math.max(1, monthRevenue);
  const collectionRatePct = monthRevenue + shared.outstanding > 0
    ? (monthRevenue / (monthRevenue + shared.outstanding)) * 100
    : 100;

  const cancelledCount = monthSale.cancelled_count ?? 0;
  const bookingCount = monthSale.booking_count;
  const cancellationRatePct = bookingCount + cancelledCount > 0
    ? (cancelledCount / (bookingCount + cancelledCount)) * 100
    : 0;

  const totalCustomers = customerMix.repeatCustomers + customerMix.newCustomers;
  const repeatCustomerRatePct = totalCustomers > 0
    ? (customerMix.repeatCustomers / totalCustomers) * 100
    : 0;

  const avgBookingValue = bookingCount > 0 ? monthSale.total_sale / bookingCount : 0;

  const lateReturnDenom = Math.max(monthSale.dresses_delivered, shared.overdueReturns, 1);
  const lateReturnPct = (shared.overdueReturns / lateReturnDenom) * 100;

  return {
    revenueGrowthPct,
    bookingGrowthPct,
    utilizationPct: shared.utilizationPct,
    availabilityPct: shared.availabilityPct,
    outstandingRatio,
    collectionRatePct,
    overdueReturns: shared.overdueReturns,
    lateReturnPct,
    cancellationRatePct,
    repeatCustomerRatePct,
    avgBookingValue,
    idleRatioPct: shared.idleRatioPct,
    maintenanceRatioPct: shared.maintenanceRatioPct,
  };
}

async function scoreForDate(dateIso: string, shared: SharedContext): Promise<number> {
  const metrics = await collectHealthMetrics(dateIso, shared);
  return computeHealthScore(metrics).score;
}

/**
 * Generate the full health-score report for a date + user. Read-only.
 * Includes a Today / Last Week / Last Month / Last Year history trend.
 */
export async function generateHealthScore(opts: {
  dateIso: string;
  userName: string;
  now?: Date;
}): Promise<HealthScoreReport> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const today = new Date(`${opts.dateIso}T00:00:00.000Z`);

  const shared = await gatherSharedContext(opts.dateIso);

  const weekAgo = isoDate(addDays(today, -7));
  const monthAgo = isoDate(addDays(today, -30));
  const yearAgo = isoDate(addDays(today, -365));

  const [current, weekScore, monthScore, yearScore] = await Promise.all([
    collectHealthMetrics(opts.dateIso, shared).then(computeHealthScore),
    scoreForDate(weekAgo, shared),
    scoreForDate(monthAgo, shared),
    scoreForDate(yearAgo, shared),
  ]);

  // History is oldest → newest so the chart reads left-to-right through time.
  const history = {
    labels: ["Last Year", "Last Month", "Last Week", "Today"],
    values: [yearScore, monthScore, weekScore, current.score],
  };

  return {
    ...current,
    generatedAt: now.toISOString(),
    dateIso: opts.dateIso,
    history,
    meta: {
      durationMs: Date.now() - started,
      sources: [...HEALTH_SOURCES],
      cached: false,
      generatedFor: opts.userName,
      weightTotal: current.components.reduce((sum, c) => sum + c.weight, 0),
    },
  };
}
