import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEALTH_WEIGHTS,
  HEALTH_WEIGHT_TOTAL,
  AVG_BOOKING_TARGET,
  pctChangeSafe,
  scoreBand,
  scoreGrowth,
  scoreOverdue,
  scoreRepeat,
  scoreCancellation,
  scoreUtilization,
  buildComponents,
  computeHealthScore,
  type HealthMetrics,
} from "./healthScoreLogic";

function metrics(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
  return {
    revenueGrowthPct: 0,
    bookingGrowthPct: 0,
    utilizationPct: 60,
    availabilityPct: 30,
    outstandingRatio: 0.2,
    collectionRatePct: 80,
    overdueReturns: 0,
    lateReturnPct: 0,
    cancellationRatePct: 0,
    repeatCustomerRatePct: 40,
    avgBookingValue: 4000,
    idleRatioPct: 10,
    maintenanceRatioPct: 5,
    ...overrides,
  };
}

/** Metrics that drive every subscore to its maximum. */
function perfectMetrics(): HealthMetrics {
  return {
    revenueGrowthPct: 20,
    bookingGrowthPct: 20,
    utilizationPct: 100,
    availabilityPct: 40,
    outstandingRatio: 0,
    collectionRatePct: 100,
    overdueReturns: 0,
    lateReturnPct: 0,
    cancellationRatePct: 0,
    repeatCustomerRatePct: 50,
    avgBookingValue: AVG_BOOKING_TARGET,
    idleRatioPct: 0,
    maintenanceRatioPct: 0,
  };
}

/** Metrics that drive every subscore to zero. */
function terribleMetrics(): HealthMetrics {
  return {
    revenueGrowthPct: -100,
    bookingGrowthPct: -100,
    utilizationPct: 0,
    availabilityPct: 0,
    outstandingRatio: 2,
    collectionRatePct: 0,
    overdueReturns: 20,
    lateReturnPct: 100,
    cancellationRatePct: 100,
    repeatCustomerRatePct: 0,
    avgBookingValue: 0,
    idleRatioPct: 100,
    maintenanceRatioPct: 100,
  };
}

describe("health weighting", () => {
  it("weights sum to exactly 100", () => {
    assert.equal(HEALTH_WEIGHT_TOTAL, 100);
    assert.equal(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });

  it("component contribution equals round(weight * score / 100)", () => {
    const components = buildComponents(metrics({ utilizationPct: 80 }));
    for (const c of components) {
      assert.equal(c.contribution, Math.round((c.weight * c.score) / 100));
    }
  });
});

describe("pctChangeSafe", () => {
  it("computes signed change and rounds", () => {
    assert.equal(pctChangeSafe(120, 100), 20);
    assert.equal(pctChangeSafe(75, 100), -25);
  });
  it("returns null without a baseline", () => {
    assert.equal(pctChangeSafe(500, 0), null);
    assert.equal(pctChangeSafe(500, -5), null);
  });
});

describe("subscore functions", () => {
  it("scoreGrowth is neutral (60) with no baseline and clamps", () => {
    assert.equal(scoreGrowth(null), 60);
    assert.equal(scoreGrowth(20), 100); // 70 + 30
    assert.equal(scoreGrowth(-20), 40); // 70 - 30
    assert.equal(scoreGrowth(1000), 100); // clamped
  });
  it("scoreOverdue decreases with count", () => {
    assert.equal(scoreOverdue(0), 100);
    assert.equal(scoreOverdue(5), 50);
    assert.equal(scoreOverdue(10), 0);
    assert.equal(scoreOverdue(50), 0); // clamped
  });
  it("scoreRepeat and scoreCancellation behave monotonically", () => {
    assert.equal(scoreRepeat(50), 100);
    assert.equal(scoreRepeat(25), 50);
    assert.equal(scoreCancellation(0), 100);
    assert.equal(scoreCancellation(100), 0);
  });
  it("scoreUtilization scales toward 100", () => {
    assert.equal(scoreUtilization(0), 0);
    assert.ok(scoreUtilization(90) >= scoreUtilization(50));
  });
});

describe("scoreBand", () => {
  it("maps score ranges to bands, colours and emojis", () => {
    assert.deepEqual(scoreBand(95), { band: "Excellent", color: "green", emoji: "🟢" });
    assert.deepEqual(scoreBand(90), { band: "Excellent", color: "green", emoji: "🟢" });
    assert.deepEqual(scoreBand(89), { band: "Good", color: "green", emoji: "🟢" });
    assert.deepEqual(scoreBand(75), { band: "Good", color: "green", emoji: "🟢" });
    assert.deepEqual(scoreBand(74), { band: "Needs Attention", color: "yellow", emoji: "🟡" });
    assert.deepEqual(scoreBand(60), { band: "Needs Attention", color: "yellow", emoji: "🟡" });
    assert.deepEqual(scoreBand(59), { band: "Critical", color: "red", emoji: "🔴" });
    assert.deepEqual(scoreBand(0), { band: "Critical", color: "red", emoji: "🔴" });
  });
});

describe("computeHealthScore", () => {
  it("gives 100 / Excellent for perfect metrics with positives and no negatives", () => {
    const result = computeHealthScore(perfectMetrics());
    assert.equal(result.score, 100);
    assert.equal(result.band, "Excellent");
    assert.equal(result.color, "green");
    assert.ok(result.positives.length > 0);
    assert.equal(result.negatives.length, 0);
    assert.equal(result.recommendations.length, 0);
  });

  it("gives 0 / Critical for terrible metrics with negatives and recommendations", () => {
    const result = computeHealthScore(terribleMetrics());
    assert.equal(result.score, 0);
    assert.equal(result.band, "Critical");
    assert.equal(result.color, "red");
    assert.ok(result.negatives.length > 0);
    assert.ok(result.recommendations.length > 0);
    assert.equal(result.positives.length, 0);
  });

  it("is deterministic (never random)", () => {
    const m = metrics();
    assert.equal(computeHealthScore(m).score, computeHealthScore(m).score);
  });

  it("derives explanations from real metric numbers (not fabricated)", () => {
    const result = computeHealthScore(metrics({ overdueReturns: 12, repeatCustomerRatePct: 48 }));
    // A high overdue count must surface as a negative referencing the actual count.
    assert.ok(result.negatives.some((n) => n.includes("12")));
    // Recommendations must only come from low-scoring components.
    for (const rec of result.recommendations) {
      const comp = result.components.find((c) => c.key === rec.id);
      assert.ok(comp && comp.score <= 50, `recommendation ${rec.id} should map to a low component`);
    }
  });

  it("keeps the score within 0–100 for arbitrary inputs", () => {
    const result = computeHealthScore(metrics({ revenueGrowthPct: 999, outstandingRatio: -5, utilizationPct: 250 }));
    assert.ok(result.score >= 0 && result.score <= 100);
  });
});
