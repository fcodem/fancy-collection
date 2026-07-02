import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Mirrors production overlap rules in booking.ts and operations.ts.
 * Existing booking: 26-06-2026 → 28-06-2026
 */
function classifyOverlap(
  existingDelivery: string,
  existingReturn: string,
  newDelivery: string,
  newReturn: string,
): "blocked" | "returning_warning" | "booked_warning" | "clear" {
  const bD = existingDelivery.slice(0, 10);
  const bR = existingReturn.slice(0, 10);
  const dIso = newDelivery.slice(0, 10);
  const rIso = newReturn.slice(0, 10);

  if (bR === dIso) return "returning_warning";
  if (bD === rIso) return "booked_warning";
  const overlaps = !(rIso < bD || dIso > bR);
  if (!overlaps) return "clear";
  return "blocked";
}

describe("booking overlap business rules (regression spec)", () => {
  const existingD = "2026-06-26";
  const existingR = "2026-06-28";

  it("allows same-day return→delivery handover with returning warning", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-28", "2026-06-30"), "returning_warning");
  });

  it("allows same-day delivery→return handover with booked warning", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-25", "2026-06-26"), "booked_warning");
  });

  it("blocks true overlap", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-27", "2026-06-29"), "blocked");
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-26", "2026-06-28"), "blocked");
  });

  it("blocks partial overlap (27-29 vs 26-28)", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-27", "2026-06-29"), "blocked");
  });

  it("blocks exact duplicate dates", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-26", "2026-06-28"), "blocked");
  });

  it("allows booking ending on existing delivery day (booked warning)", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-24", "2026-06-26"), "booked_warning");
  });

  it("allows booking starting on existing return day (returning warning)", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-28", "2026-07-02"), "returning_warning");
  });

  it("blocks when new period fully contains existing", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-25", "2026-06-29"), "blocked");
  });

  it("blocks when existing fully contains new period", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-27", "2026-06-27"), "blocked");
  });

  it("allows multiple non-overlapping bookings on adjacent days", () => {
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-20", "2026-06-25"), "clear");
    assert.equal(classifyOverlap(existingD, existingR, "2026-06-29", "2026-07-05"), "clear");
  });
});
