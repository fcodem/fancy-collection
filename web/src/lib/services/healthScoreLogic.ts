/**
 * AI Business Health Score — deterministic scoring logic (PURE).
 *
 * No server/database imports so it can be unit-tested in isolation. It converts
 * a plain `HealthMetrics` object (computed from the existing analytics layer)
 * into a 0–100 composite score using a DOCUMENTED, fixed weighting. The score is
 * never random and every explanation/recommendation is derived from the same
 * component subscores — nothing is fabricated.
 */

export type HealthBand = "Excellent" | "Good" | "Needs Attention" | "Critical";
export type HealthColor = "green" | "yellow" | "red";

/** Benchmark used to normalise average booking value into a 0–100 subscore. */
export const AVG_BOOKING_TARGET = 5000;

/** Plain-number inputs for the score (all sourced from existing analytics). */
export interface HealthMetrics {
  revenueGrowthPct: number | null;
  bookingGrowthPct: number | null;
  utilizationPct: number;
  availabilityPct: number;
  outstandingRatio: number;
  collectionRatePct: number;
  overdueReturns: number;
  lateReturnPct: number;
  cancellationRatePct: number;
  repeatCustomerRatePct: number;
  avgBookingValue: number;
  idleRatioPct: number;
  maintenanceRatioPct: number;
}

export interface HealthComponent {
  key: string;
  label: string;
  weight: number;
  /** 0–100 subscore for this component. */
  score: number;
  /** weight * score / 100 — the component's contribution to the final score. */
  contribution: number;
}

export interface HealthRecommendation {
  id: string;
  text: string;
  href?: string;
}

export interface HealthScoreResult {
  score: number;
  band: HealthBand;
  color: HealthColor;
  emoji: string;
  components: HealthComponent[];
  positives: string[];
  negatives: string[];
  recommendations: HealthRecommendation[];
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Signed percentage change of `current` vs `previous`, rounded. Null when no baseline. */
export function pctChangeSafe(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Documented component weights (must sum to 100). */
export const HEALTH_WEIGHTS = {
  revenueGrowth: 13,
  bookingGrowth: 8,
  utilization: 10,
  availability: 6,
  outstanding: 9,
  collection: 9,
  overdue: 8,
  lateReturn: 6,
  cancellation: 7,
  repeatCustomers: 9,
  avgBooking: 5,
  idleInventory: 6,
  maintenance: 4,
} as const;

/** Sum of all weights — exported so tests can assert it equals 100. */
export const HEALTH_WEIGHT_TOTAL = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);

// --- Individual subscore functions (deterministic, monotonic) --------------

export function scoreGrowth(pct: number | null): number {
  if (pct === null) return 60; // neutral when there is no baseline period
  return clamp(70 + pct * 1.5);
}
export function scoreUtilization(pct: number): number {
  return clamp(pct * 1.15);
}
export function scoreAvailability(pct: number): number {
  return clamp(pct * 2.5);
}
export function scoreOutstanding(ratio: number): number {
  return clamp(100 - ratio * 100);
}
export function scoreCollection(pct: number): number {
  return clamp(pct);
}
export function scoreOverdue(count: number): number {
  return clamp(100 - count * 10);
}
export function scoreLateReturn(pct: number): number {
  return clamp(100 - pct * 2);
}
export function scoreCancellation(pct: number): number {
  return clamp(100 - pct * 3);
}
export function scoreRepeat(pct: number): number {
  return clamp(pct * 2);
}
export function scoreAvgBooking(value: number): number {
  return clamp((value / AVG_BOOKING_TARGET) * 100);
}
export function scoreIdle(pct: number): number {
  return clamp(100 - pct * 2);
}
export function scoreMaintenance(pct: number): number {
  return clamp(100 - pct * 4);
}

export function scoreBand(score: number): { band: HealthBand; color: HealthColor; emoji: string } {
  if (score >= 90) return { band: "Excellent", color: "green", emoji: "🟢" };
  if (score >= 75) return { band: "Good", color: "green", emoji: "🟢" };
  if (score >= 60) return { band: "Needs Attention", color: "yellow", emoji: "🟡" };
  return { band: "Critical", color: "red", emoji: "🔴" };
}

function round(n: number): number {
  return Math.round(n);
}

/** Build the weighted component list from raw metrics. */
export function buildComponents(m: HealthMetrics): HealthComponent[] {
  const raw: Array<Omit<HealthComponent, "contribution">> = [
    { key: "revenueGrowth", label: "Revenue growth", weight: HEALTH_WEIGHTS.revenueGrowth, score: round(scoreGrowth(m.revenueGrowthPct)) },
    { key: "bookingGrowth", label: "Booking growth", weight: HEALTH_WEIGHTS.bookingGrowth, score: round(scoreGrowth(m.bookingGrowthPct)) },
    { key: "utilization", label: "Inventory utilization", weight: HEALTH_WEIGHTS.utilization, score: round(scoreUtilization(m.utilizationPct)) },
    { key: "availability", label: "Dress availability", weight: HEALTH_WEIGHTS.availability, score: round(scoreAvailability(m.availabilityPct)) },
    { key: "outstanding", label: "Outstanding payments", weight: HEALTH_WEIGHTS.outstanding, score: round(scoreOutstanding(m.outstandingRatio)) },
    { key: "collection", label: "Collection rate", weight: HEALTH_WEIGHTS.collection, score: round(scoreCollection(m.collectionRatePct)) },
    { key: "overdue", label: "Overdue returns", weight: HEALTH_WEIGHTS.overdue, score: round(scoreOverdue(m.overdueReturns)) },
    { key: "lateReturn", label: "Late-return rate", weight: HEALTH_WEIGHTS.lateReturn, score: round(scoreLateReturn(m.lateReturnPct)) },
    { key: "cancellation", label: "Cancellation rate", weight: HEALTH_WEIGHTS.cancellation, score: round(scoreCancellation(m.cancellationRatePct)) },
    { key: "repeatCustomers", label: "Repeat customers", weight: HEALTH_WEIGHTS.repeatCustomers, score: round(scoreRepeat(m.repeatCustomerRatePct)) },
    { key: "avgBooking", label: "Average booking value", weight: HEALTH_WEIGHTS.avgBooking, score: round(scoreAvgBooking(m.avgBookingValue)) },
    { key: "idleInventory", label: "Idle inventory", weight: HEALTH_WEIGHTS.idleInventory, score: round(scoreIdle(m.idleRatioPct)) },
    { key: "maintenance", label: "Repair / cleaning backlog", weight: HEALTH_WEIGHTS.maintenance, score: round(scoreMaintenance(m.maintenanceRatioPct)) },
  ];
  return raw.map((c) => ({ ...c, contribution: Math.round((c.weight * c.score) / 100) }));
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Human explanation for a component, given the metrics (positive vs negative framing). */
function reasonFor(key: string, m: HealthMetrics, positive: boolean): string {
  switch (key) {
    case "revenueGrowth":
      return m.revenueGrowthPct === null
        ? "Revenue trend is stable with no prior-period baseline."
        : `Revenue is ${m.revenueGrowthPct >= 0 ? "up" : "down"} ${Math.abs(m.revenueGrowthPct)}% vs last month.`;
    case "bookingGrowth":
      return m.bookingGrowthPct === null
        ? "Booking volume is steady."
        : `Bookings are ${m.bookingGrowthPct >= 0 ? "up" : "down"} ${Math.abs(m.bookingGrowthPct)}% vs last month.`;
    case "utilization":
      return `Inventory utilization is ${Math.round(m.utilizationPct)}%.`;
    case "availability":
      return `${Math.round(m.availabilityPct)}% of inventory is available to book.`;
    case "outstanding":
      return positive
        ? "Outstanding balances are low relative to revenue."
        : `Outstanding balances are high relative to revenue (${Math.round(m.outstandingRatio * 100)}% of monthly revenue).`;
    case "collection":
      return `Payment collection rate is ${Math.round(m.collectionRatePct)}%.`;
    case "overdue":
      return m.overdueReturns === 0
        ? "No overdue returns."
        : `${m.overdueReturns} booking${m.overdueReturns === 1 ? "" : "s"} overdue for return.`;
    case "lateReturn":
      return `Late-return rate is ${Math.round(m.lateReturnPct)}%.`;
    case "cancellation":
      return `Cancellation rate is ${Math.round(m.cancellationRatePct)}%.`;
    case "repeatCustomers":
      return `${Math.round(m.repeatCustomerRatePct)}% of customers are returning customers.`;
    case "avgBooking":
      return `Average booking value is ${inr(m.avgBookingValue)}.`;
    case "idleInventory":
      return `${Math.round(m.idleRatioPct)}% of inventory is idle.`;
    case "maintenance":
      return `${Math.round(m.maintenanceRatioPct)}% of inventory is in repair/cleaning.`;
    default:
      return "";
  }
}

const RECOMMENDATION_HREF: Record<string, string> = {
  revenueGrowth: "/finance/monthly-sale",
  bookingGrowth: "/finance/monthly-sale",
  utilization: "/finance/inventory-profitability",
  availability: "/inventory",
  outstanding: "/billing",
  collection: "/billing",
  overdue: "/late-return",
  lateReturn: "/late-return",
  cancellation: "/postponed-booking",
  repeatCustomers: "/customers",
  avgBooking: "/finance/top-performer",
  idleInventory: "/finance/inventory-profitability",
  maintenance: "/inventory",
};

function recommendationText(key: string, m: HealthMetrics): string {
  switch (key) {
    case "revenueGrowth":
      return "Revenue is slipping — run a promotion or push high-margin categories to lift sales.";
    case "bookingGrowth":
      return "Booking volume is down — re-engage past customers and boost enquiries.";
    case "utilization":
      return "Utilization is low — feature under-booked stock more prominently.";
    case "availability":
      return "Very little stock is free — consider expanding popular categories.";
    case "outstanding":
      return `Chase ${inr(m.outstandingRatio * m.avgBookingValue)} of outstanding balances to improve cash flow.`;
    case "collection":
      return "Collection rate is low — tighten balance collection at delivery/return.";
    case "overdue":
      return `Follow up on ${m.overdueReturns} overdue return${m.overdueReturns === 1 ? "" : "s"} to recover stock and deposits.`;
    case "lateReturn":
      return "Late returns are high — send return reminders and enforce return times.";
    case "cancellation":
      return "Cancellations are elevated — review deposit and confirmation policy.";
    case "repeatCustomers":
      return "Few repeat customers — start a loyalty or follow-up campaign.";
    case "avgBooking":
      return "Average booking value is low — upsell add-ons and premium items.";
    case "idleInventory":
      return "Idle stock is high — discount or retire items that rarely rent.";
    case "maintenance":
      return "Repair/cleaning backlog is high — clear it to return items to circulation.";
    default:
      return "";
  }
}

export function computeHealthScore(m: HealthMetrics): HealthScoreResult {
  const components = buildComponents(m);
  const score = clamp(round(components.reduce((sum, c) => sum + (c.weight * c.score) / 100, 0)));
  const { band, color, emoji } = scoreBand(score);

  const positives = components
    .filter((c) => c.score >= 75)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 4)
    .map((c) => reasonFor(c.key, m, true));

  const negatives = components
    .filter((c) => c.score <= 50)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((c) => reasonFor(c.key, m, false));

  const recommendations: HealthRecommendation[] = components
    .filter((c) => c.score <= 50)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((c) => ({ id: c.key, text: recommendationText(c.key, m), href: RECOMMENDATION_HREF[c.key] }));

  return { score, band, color, emoji, components, positives, negatives, recommendations };
}
