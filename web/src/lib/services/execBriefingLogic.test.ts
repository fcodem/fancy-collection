import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORECAST_LABEL,
  IDLE_LOOKBACK_DAYS,
  pctChange,
  buildGreeting,
  deriveInsights,
  deriveRecommendations,
  deriveAlerts,
  deriveUpcoming,
  deriveForecasts,
  buildBriefingSections,
  type BriefingMetrics,
} from "./execBriefingLogic";

/** A metrics fixture with everything zeroed; override per test. */
function metrics(overrides: Partial<BriefingMetrics> = {}): BriefingMetrics {
  return {
    yesterdayRevenue: 0,
    priorDayRevenue: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    lastMonthRevenue: 0,
    daysElapsedInMonth: 0,
    daysInMonth: 30,
    historicalMonthly: [],
    deliveriesToday: 0,
    returnsToday: 0,
    remainingToDeliver: 0,
    overdueReturns: 0,
    ordersDueSoon: 0,
    pendingPayments: 0,
    totalItems: 0,
    availableItems: 0,
    rentedItems: 0,
    maintenanceItems: 0,
    itemsWithRevenue: 0,
    utilizationPct: 0,
    idleItemCount: 0,
    idleLookbackDays: IDLE_LOOKBACK_DAYS,
    mostValuableItem: null,
    topCategory: null,
    underutilizedCategory: null,
    lowStockCategory: null,
    topDress: null,
    monthBookingCount: 0,
    avgBookingValue: 0,
    topCustomer: null,
    repeatCustomers: 0,
    newCustomers: 0,
    ...overrides,
  };
}

describe("pctChange", () => {
  it("computes positive change", () => {
    assert.equal(pctChange(118, 100), 18);
  });

  it("computes negative change", () => {
    assert.equal(pctChange(80, 100), -20);
  });

  it("rounds to nearest whole percent", () => {
    assert.equal(pctChange(133, 100), 33);
    assert.equal(pctChange(1005, 1000), 1); // 0.5% rounds to 1
  });

  it("returns null when there is no baseline", () => {
    assert.equal(pctChange(500, 0), null);
    assert.equal(pctChange(500, -10), null);
  });
});

describe("buildGreeting", () => {
  it("uses time of day and the user's name", () => {
    const morning = new Date(2026, 0, 1, 8, 0, 0);
    assert.equal(buildGreeting("Asha", morning), "Good morning, Asha");
    const afternoon = new Date(2026, 0, 1, 14, 0, 0);
    assert.equal(buildGreeting("Asha", afternoon), "Good afternoon, Asha");
    const evening = new Date(2026, 0, 1, 20, 0, 0);
    assert.equal(buildGreeting("Asha", evening), "Good evening, Asha");
  });

  it("falls back to a neutral name", () => {
    const morning = new Date(2026, 0, 1, 8, 0, 0);
    assert.equal(buildGreeting("", morning), "Good morning, there");
  });
});

describe("deriveInsights", () => {
  it("reports day-over-day revenue change with correct direction", () => {
    const insights = deriveInsights(metrics({ yesterdayRevenue: 12000, priorDayRevenue: 10000 }));
    const day = insights.find((i) => i.id === "revenue-day");
    assert.ok(day, "expected a day revenue insight");
    assert.match(day!.text, /increased 20%/);
  });

  it("does not fabricate a day insight without a baseline", () => {
    const insights = deriveInsights(metrics({ yesterdayRevenue: 12000, priorDayRevenue: 0 }));
    assert.equal(insights.find((i) => i.id === "revenue-day"), undefined);
  });

  it("states category share only when supported by a number", () => {
    const withShare = deriveInsights(metrics({ topCategory: { name: "Lehenga", revenue: 45000, sharePct: 45 } }));
    assert.ok(withShare.find((i) => i.id === "top-category")?.text.includes("45%"));

    const withoutShare = deriveInsights(metrics({ topCategory: { name: "Lehenga", revenue: 0, sharePct: 0 } }));
    assert.equal(withoutShare.find((i) => i.id === "top-category"), undefined);
  });

  it("reports idle inventory using the lookback window", () => {
    const insights = deriveInsights(metrics({ idleItemCount: 17 }));
    const idle = insights.find((i) => i.id === "idle-inventory");
    assert.ok(idle);
    assert.match(idle!.text, /17 items have not been rented in over 180 days/);
  });

  it("projects month-over-month change from run-rate", () => {
    // 50000 over 10 of 30 days -> projected 150000, vs last month 100000 => +50%
    const insights = deriveInsights(metrics({
      monthRevenue: 50000,
      lastMonthRevenue: 100000,
      daysElapsedInMonth: 10,
      daysInMonth: 30,
    }));
    const month = insights.find((i) => i.id === "revenue-month");
    assert.ok(month);
    assert.match(month!.text, /up 50%/);
  });
});

describe("deriveRecommendations", () => {
  it("recommends promoting an underutilized category with stock", () => {
    const recs = deriveRecommendations(metrics({ underutilizedCategory: { name: "Gown", revenue: 500, stock: 12 } }));
    const promote = recs.find((r) => r.id === "promote-category");
    assert.ok(promote);
    assert.match(promote!.text, /Promote Gown/);
    assert.equal(promote!.href, "/finance/category-analysis");
  });

  it("recommends chasing outstanding balances and overdue returns", () => {
    const recs = deriveRecommendations(metrics({ pendingPayments: 24000, overdueReturns: 3 }));
    assert.ok(recs.find((r) => r.id === "follow-balances"));
    assert.ok(recs.find((r) => r.id === "chase-overdue"));
  });

  it("returns nothing when all metrics are clean", () => {
    assert.deepEqual(deriveRecommendations(metrics()), []);
  });
});

describe("deriveAlerts", () => {
  it("flags overdue returns as critical (red)", () => {
    const alerts = deriveAlerts(metrics({ overdueReturns: 2 }));
    const overdue = alerts.find((a) => a.id === "overdue-returns");
    assert.ok(overdue);
    assert.equal(overdue!.severity, "critical");
  });

  it("escalates large outstanding balances to critical", () => {
    assert.equal(deriveAlerts(metrics({ pendingPayments: 20000 })).find((a) => a.id === "pending-payments")?.severity, "warning");
    assert.equal(deriveAlerts(metrics({ pendingPayments: 80000 })).find((a) => a.id === "pending-payments")?.severity, "critical");
  });

  it("flags very high utilization", () => {
    const alerts = deriveAlerts(metrics({ utilizationPct: 92 }));
    assert.ok(alerts.find((a) => a.id === "utilization-high"));
  });
});

describe("deriveUpcoming", () => {
  it("lists deliveries and returns scheduled today", () => {
    const events = deriveUpcoming(metrics({ deliveriesToday: 4, returnsToday: 2 }));
    assert.ok(events.find((e) => e.id === "deliveries"));
    assert.ok(events.find((e) => e.id === "returns"));
  });
});

describe("deriveForecasts", () => {
  it("always labels every forecast as a historical prediction", () => {
    const forecasts = deriveForecasts(metrics({
      monthRevenue: 60000,
      daysElapsedInMonth: 15,
      daysInMonth: 30,
      historicalMonthly: [40000, 50000, 60000],
    }));
    assert.ok(forecasts.length >= 1);
    for (const f of forecasts) {
      assert.equal(f.label, FORECAST_LABEL);
    }
  });

  it("projects month revenue by run-rate", () => {
    // 60000 over 15 of 30 days -> 120000 projected
    const forecasts = deriveForecasts(metrics({ monthRevenue: 60000, daysElapsedInMonth: 15, daysInMonth: 30 }));
    const month = forecasts.find((f) => f.id === "month-projection");
    assert.ok(month);
    assert.equal(month!.value, 120000);
  });

  it("averages historical months only when at least two are present", () => {
    const none = deriveForecasts(metrics({ historicalMonthly: [50000] }));
    assert.equal(none.find((f) => f.id === "monthly-average"), undefined);

    const avg = deriveForecasts(metrics({ historicalMonthly: [40000, 60000] }));
    const monthlyAvg = avg.find((f) => f.id === "monthly-average");
    assert.ok(monthlyAvg);
    assert.equal(monthlyAvg!.value, 50000);
  });

  it("produces no forecasts without revenue or history", () => {
    assert.deepEqual(deriveForecasts(metrics()), []);
  });
});

describe("buildBriefingSections", () => {
  it("assembles all sections and every forecast keeps its label", () => {
    const now = new Date(2026, 0, 1, 9, 0, 0);
    const sections = buildBriefingSections(
      metrics({
        yesterdayRevenue: 15000,
        priorDayRevenue: 12000,
        monthRevenue: 90000,
        lastMonthRevenue: 80000,
        daysElapsedInMonth: 12,
        daysInMonth: 31,
        historicalMonthly: [70000, 85000],
        overdueReturns: 1,
        pendingPayments: 5000,
        utilizationPct: 82,
        topCategory: { name: "Lehenga", revenue: 40000, sharePct: 44 },
      }),
      "Owner",
      now,
    );

    assert.equal(sections.greeting, "Good morning, Owner");
    assert.ok(sections.kpis.length > 0);
    assert.ok(sections.insights.length > 0);
    assert.ok(sections.alerts.length > 0);
    assert.ok(sections.followUps.length > 0);
    for (const f of sections.forecasts) {
      assert.equal(f.label, FORECAST_LABEL);
    }
  });
});
