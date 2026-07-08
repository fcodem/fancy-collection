/**
 * AI Daily Executive Briefing — deterministic derivation logic (PURE).
 *
 * This module has NO server/database imports so it can be unit-tested in
 * isolation. It turns a plain `BriefingMetrics` object (computed elsewhere from
 * the existing analytics layer) into insights, recommendations, alerts,
 * upcoming events, forecasts and KPI cards. It never fabricates figures — every
 * statement is gated on the underlying computed number.
 */

/** Every forecast object carries this exact label; forecasts are never guaranteed. */
export const FORECAST_LABEL = "Prediction based on historical business data.";

/** Idle-inventory lookback window (days) used for "not rented in over N days". */
export const IDLE_LOOKBACK_DAYS = 180;

export type AlertSeverity = "critical" | "warning";

export interface KpiCard {
  key: string;
  label: string;
  value: number;
  format: "inr" | "count" | "percent";
  href?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
  sub?: string;
}

export interface Insight {
  id: string;
  text: string;
}

export interface Recommendation {
  id: string;
  text: string;
  href?: string;
}

export interface PriorityAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  detail: string;
  href?: string;
}

export interface Forecast {
  id: string;
  title: string;
  value: number;
  format: "inr" | "count";
  basis: string;
  /** Always FORECAST_LABEL. */
  label: string;
}

export interface FollowUpQuestion {
  id: string;
  text: string;
  href: string;
}

/** Plain-number intermediate consumed by the (pure, testable) derivation functions. */
export interface BriefingMetrics {
  // revenue (all sourced from finance.total_sale)
  yesterdayRevenue: number;
  priorDayRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  lastMonthRevenue: number;
  // month run-rate context
  daysElapsedInMonth: number;
  daysInMonth: number;
  historicalMonthly: number[];
  // operations (from dashboard service)
  deliveriesToday: number;
  returnsToday: number;
  remainingToDeliver: number;
  overdueReturns: number;
  ordersDueSoon: number;
  pendingPayments: number;
  // inventory
  totalItems: number;
  availableItems: number;
  rentedItems: number;
  maintenanceItems: number;
  itemsWithRevenue: number;
  utilizationPct: number;
  idleItemCount: number;
  idleLookbackDays: number;
  mostValuableItem: { name: string; revenue: number } | null;
  // category / dress
  topCategory: { name: string; revenue: number; sharePct: number } | null;
  underutilizedCategory: { name: string; revenue: number; stock: number } | null;
  lowStockCategory: { name: string; stock: number; bookings: number } | null;
  topDress: { name: string; bookings: number; revenue: number } | null;
  // customers
  monthBookingCount: number;
  avgBookingValue: number;
  topCustomer: { name: string; bookings: number } | null;
  repeatCustomers: number;
  newCustomers: number;
}

export interface BriefingSections {
  greeting: string;
  kpis: KpiCard[];
  insights: Insight[];
  recommendations: Recommendation[];
  alerts: PriorityAlert[];
  upcomingEvents: UpcomingEvent[];
  forecasts: Forecast[];
  followUps: FollowUpQuestion[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Signed percentage change of `current` vs `previous`, rounded. Null when no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function buildGreeting(name: string, now: Date): string {
  const hour = now.getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const who = name?.trim() ? name.trim() : "there";
  return `Good ${partOfDay}, ${who}`;
}

export function deriveInsights(m: BriefingMetrics): Insight[] {
  const out: Insight[] = [];

  const dayChange = pctChange(m.yesterdayRevenue, m.priorDayRevenue);
  if (m.yesterdayRevenue > 0 && dayChange !== null) {
    const dir = dayChange >= 0 ? "increased" : "decreased";
    out.push({
      id: "revenue-day",
      text: `Yesterday's revenue was ${inr(m.yesterdayRevenue)}, ${dir} ${Math.abs(dayChange)}% vs the previous day.`,
    });
  }

  // Month vs last month, based on run-rate projection (an honest comparison of a
  // partial month against a full month).
  if (m.lastMonthRevenue > 0 && m.daysElapsedInMonth > 0 && m.monthRevenue > 0) {
    const projected = (m.monthRevenue / m.daysElapsedInMonth) * m.daysInMonth;
    const monthChange = pctChange(projected, m.lastMonthRevenue);
    if (monthChange !== null) {
      const dir = monthChange >= 0 ? "up" : "down";
      out.push({
        id: "revenue-month",
        text: `This month is on track for ${inr(projected)} — ${dir} ${Math.abs(monthChange)}% vs last month.`,
      });
    }
  }

  if (m.topCategory && m.topCategory.sharePct > 0) {
    out.push({
      id: "top-category",
      text: `${m.topCategory.name} generated ${m.topCategory.sharePct}% of this month's revenue.`,
    });
  }

  if (m.utilizationPct > 0) {
    out.push({
      id: "utilization",
      text: `Inventory utilization reached ${m.utilizationPct}% over the last ${m.idleLookbackDays} days.`,
    });
  }

  if (m.idleItemCount > 0) {
    out.push({
      id: "idle-inventory",
      text: `${m.idleItemCount} ${m.idleItemCount === 1 ? "item has" : "items have"} not been rented in over ${m.idleLookbackDays} days.`,
    });
  }

  if (m.topDress && m.topDress.bookings > 0) {
    out.push({
      id: "top-dress",
      text: `"${m.topDress.name}" was your most rented item this month (${m.topDress.bookings} booking${m.topDress.bookings === 1 ? "" : "s"}).`,
    });
  }

  const totalCustomers = m.repeatCustomers + m.newCustomers;
  if (totalCustomers > 0 && m.repeatCustomers > 0) {
    const repeatPct = Math.round((m.repeatCustomers / totalCustomers) * 100);
    out.push({
      id: "repeat-customers",
      text: `${repeatPct}% of this month's customers are returning customers.`,
    });
  }

  if (m.avgBookingValue > 0) {
    out.push({
      id: "avg-booking",
      text: `Average booking value this month is ${inr(m.avgBookingValue)}.`,
    });
  }

  return out;
}

export function deriveRecommendations(m: BriefingMetrics): Recommendation[] {
  const out: Recommendation[] = [];

  if (m.underutilizedCategory && m.underutilizedCategory.stock > 0) {
    out.push({
      id: "promote-category",
      text: `Promote ${m.underutilizedCategory.name} with a seasonal discount — it has stock but low rental revenue this month.`,
      href: "/finance/category-analysis",
    });
  }

  if (m.idleItemCount > 0) {
    out.push({
      id: "retire-idle",
      text: `Review or retire ${m.idleItemCount} item${m.idleItemCount === 1 ? "" : "s"} not rented in over ${m.idleLookbackDays} days to free up space.`,
      href: "/finance/inventory-profitability",
    });
  }

  if (m.pendingPayments > 0) {
    out.push({
      id: "follow-balances",
      text: `Follow up with customers carrying ${inr(m.pendingPayments)} in outstanding balances.`,
      href: "/billing",
    });
  }

  if (m.overdueReturns > 0) {
    out.push({
      id: "chase-overdue",
      text: `Chase ${m.overdueReturns} overdue return${m.overdueReturns === 1 ? "" : "s"} to recover inventory and deposits.`,
      href: "/late-return",
    });
  }

  if (m.utilizationPct >= 90 && m.topCategory) {
    out.push({
      id: "expand-stock",
      text: `Utilization is high (${m.utilizationPct}%). Consider adding stock to ${m.topCategory.name} to meet demand.`,
      href: "/finance/inventory-profitability",
    });
  }

  if (m.lowStockCategory) {
    out.push({
      id: "restock-low",
      text: `${m.lowStockCategory.name} is running low (${m.lowStockCategory.stock} in stock) despite recent demand — consider restocking.`,
      href: "/inventory",
    });
  }

  return out;
}

export function deriveAlerts(m: BriefingMetrics): PriorityAlert[] {
  const out: PriorityAlert[] = [];

  if (m.overdueReturns > 0) {
    out.push({
      id: "overdue-returns",
      severity: "critical",
      title: "Overdue returns",
      detail: `${m.overdueReturns} booking${m.overdueReturns === 1 ? "" : "s"} past the return date.`,
      href: "/late-return",
    });
  }

  if (m.pendingPayments > 0) {
    out.push({
      id: "pending-payments",
      severity: m.pendingPayments >= 50000 ? "critical" : "warning",
      title: "Outstanding payments",
      detail: `${inr(m.pendingPayments)} in unpaid balances.`,
      href: "/billing",
    });
  }

  if (m.ordersDueSoon > 0) {
    out.push({
      id: "orders-due",
      severity: "warning",
      title: "Custom orders due soon",
      detail: `${m.ordersDueSoon} custom order${m.ordersDueSoon === 1 ? "" : "s"} due within 3 days.`,
      href: "/orders",
    });
  }

  if (m.remainingToDeliver > 0) {
    out.push({
      id: "deliveries-today",
      severity: "warning",
      title: "Deliveries pending",
      detail: `${m.remainingToDeliver} booking${m.remainingToDeliver === 1 ? "" : "s"} still to be delivered.`,
      href: "/remaining-to-deliver",
    });
  }

  if (m.returnsToday > 0) {
    out.push({
      id: "returns-today",
      severity: "warning",
      title: "Returns expected today",
      detail: `${m.returnsToday} booking${m.returnsToday === 1 ? "" : "s"} scheduled to return today.`,
      href: "/returning-today",
    });
  }

  if (m.lowStockCategory) {
    out.push({
      id: "low-stock",
      severity: "warning",
      title: "Low stock",
      detail: `${m.lowStockCategory.name} has only ${m.lowStockCategory.stock} item${m.lowStockCategory.stock === 1 ? "" : "s"} in stock.`,
      href: "/inventory",
    });
  }

  if (m.utilizationPct >= 90) {
    out.push({
      id: "utilization-high",
      severity: "warning",
      title: "Utilization very high",
      detail: `Inventory utilization is at ${m.utilizationPct}% — limited free stock.`,
      href: "/finance/inventory-profitability",
    });
  }

  return out;
}

export function deriveUpcoming(m: BriefingMetrics): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];

  if (m.deliveriesToday > 0) {
    out.push({
      id: "deliveries",
      title: "Deliveries today",
      detail: `${m.deliveriesToday} order${m.deliveriesToday === 1 ? "" : "s"} scheduled for delivery.`,
      href: "/dashboard/stats/total-orders",
    });
  }

  if (m.returnsToday > 0) {
    out.push({
      id: "returns",
      title: "Returns today",
      detail: `${m.returnsToday} booking${m.returnsToday === 1 ? "" : "s"} expected back.`,
      href: "/returning-today",
    });
  }

  if (m.ordersDueSoon > 0) {
    out.push({
      id: "orders",
      title: "Custom orders due",
      detail: `${m.ordersDueSoon} order${m.ordersDueSoon === 1 ? "" : "s"} due within the next 3 days.`,
      href: "/orders",
    });
  }

  if (m.remainingToDeliver > 0) {
    out.push({
      id: "pending-deliveries",
      title: "Pending deliveries",
      detail: `${m.remainingToDeliver} booking${m.remainingToDeliver === 1 ? "" : "s"} awaiting delivery.`,
      href: "/remaining-to-deliver",
    });
  }

  return out;
}

export function deriveForecasts(m: BriefingMetrics): Forecast[] {
  const out: Forecast[] = [];

  if (m.daysElapsedInMonth > 0 && m.monthRevenue > 0) {
    const dailyRate = m.monthRevenue / m.daysElapsedInMonth;
    out.push({
      id: "month-projection",
      title: "Projected revenue this month",
      value: Math.round(dailyRate * m.daysInMonth),
      format: "inr",
      basis: `Run-rate from ${inr(m.monthRevenue)} over ${m.daysElapsedInMonth} day(s) so far`,
      label: FORECAST_LABEL,
    });
    out.push({
      id: "week-projection",
      title: "Expected revenue next 7 days",
      value: Math.round(dailyRate * 7),
      format: "inr",
      basis: "Based on this month's daily average",
      label: FORECAST_LABEL,
    });
  }

  const hist = m.historicalMonthly.filter((v) => v > 0);
  if (hist.length >= 2) {
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    out.push({
      id: "monthly-average",
      title: "Typical monthly revenue",
      value: Math.round(avg),
      format: "inr",
      basis: `Average of ${hist.length} recent months`,
      label: FORECAST_LABEL,
    });
  }

  return out;
}

export function buildKpis(m: BriefingMetrics): KpiCard[] {
  return [
    { key: "today-revenue", label: "Today's Revenue", value: m.todayRevenue, format: "inr", tone: "primary", href: "/finance/daily-sale" },
    { key: "yesterday-revenue", label: "Yesterday's Revenue", value: m.yesterdayRevenue, format: "inr", tone: "info", href: "/finance/daily-sale" },
    { key: "month-revenue", label: "This Month's Revenue", value: m.monthRevenue, format: "inr", tone: "success", href: "/finance/monthly-sale" },
    { key: "outstanding", label: "Outstanding Payments", value: m.pendingPayments, format: "inr", tone: "danger", href: "/billing" },
    { key: "bookings-today", label: "Bookings Today", value: m.deliveriesToday + m.returnsToday, format: "count", tone: "primary" },
    { key: "deliveries-today", label: "Deliveries Today", value: m.deliveriesToday, format: "count", tone: "info", href: "/dashboard/stats/total-orders" },
    { key: "returns-today", label: "Returns Today", value: m.returnsToday, format: "count", tone: "info", href: "/returning-today" },
    { key: "available-items", label: "Available Inventory", value: m.availableItems, format: "count", tone: "success", href: "/inventory" },
    { key: "rented-items", label: "Rented Out", value: m.rentedItems, format: "count", tone: "warning", href: "/inventory" },
    { key: "maintenance-items", label: "In Maintenance", value: m.maintenanceItems, format: "count", tone: "warning", href: "/inventory" },
    { key: "avg-booking", label: "Avg Booking Value", value: m.avgBookingValue, format: "inr", tone: "info", href: "/finance/monthly-sale" },
    { key: "repeat-customers", label: "Repeat Customers", value: m.repeatCustomers, format: "count", tone: "success", href: "/customers" },
    { key: "new-customers", label: "New Customers", value: m.newCustomers, format: "count", tone: "primary", href: "/customers" },
    { key: "utilization", label: "Inventory Utilization", value: m.utilizationPct, format: "percent", tone: "info", href: "/finance/inventory-profitability" },
  ];
}

export function buildFollowUps(): FollowUpQuestion[] {
  return [
    { id: "monthly-trend", text: "How is revenue trending this month?", href: "/finance/monthly-sale" },
    { id: "top-dresses", text: "Which dresses earn the most?", href: "/finance/top-performer" },
    { id: "idle-stock", text: "Which items are underperforming?", href: "/finance/inventory-profitability" },
    { id: "category-mix", text: "How does each category perform?", href: "/finance/category-analysis" },
    { id: "outstanding", text: "Who has pending balances?", href: "/billing" },
    { id: "yearly", text: "How is the financial year shaping up?", href: "/finance/yearly-sale" },
  ];
}

export function buildBriefingSections(
  m: BriefingMetrics,
  name: string,
  now: Date,
): BriefingSections {
  return {
    greeting: buildGreeting(name, now),
    kpis: buildKpis(m),
    insights: deriveInsights(m),
    recommendations: deriveRecommendations(m),
    alerts: deriveAlerts(m),
    upcomingEvents: deriveUpcoming(m),
    forecasts: deriveForecasts(m),
    followUps: buildFollowUps(),
  };
}
