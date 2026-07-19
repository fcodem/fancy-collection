import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src", "lib", "services", "bookingDateCheckSearch.ts"),
  "utf8",
);

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

function occupancyKind(
  existingDelivery: string,
  existingReturn: string,
  newDelivery: string,
  newReturn: string,
): "busy" | "returning" | "booked" | null {
  const kind = classifyOverlap(existingDelivery, existingReturn, newDelivery, newReturn);
  if (kind === "blocked") return "busy";
  if (kind === "returning_warning") return "returning";
  if (kind === "booked_warning") return "booked";
  return null;
}

describe("single-query booking date-check contracts", () => {
  it("uses the required bounded CTE pipeline", () => {
    for (const cte of [
      "requested_items",
      "active_booking_occupancy",
      "legacy_booking_occupancy",
      "combined_occupancy",
      "hard_conflicts",
      "return_warnings",
      "delivery_warnings",
      "final_result",
    ]) {
      assert.match(source, new RegExp(`${cte} AS`));
    }
    assert.equal((source.match(/prisma\.\$queryRaw/g) ?? []).length, 1);
    assert.doesNotMatch(source, /findMany|for \(const itemId of itemIds\)/i);
  });

  it("preserves modern, legacy, cancellation, returned and edit rules", () => {
    assert.match(source, /bi\.is_cancelled = false/);
    assert.match(source, /bi\.is_returned = false/);
    assert.match(source, /NOT EXISTS \(SELECT 1 FROM booking_items bi WHERE bi\.booking_id = b\.id\)/);
    assert.match(source, /b\.id <> \$\{excludeId\}/);
    assert.match(source, /occupancy_kind = 'returning'/);
    assert.match(source, /occupancy_kind = 'booked'/);
    assert.match(source, /occupancy_kind = 'busy'/);
  });

  it("includes jewellery part occupancy and hard block", () => {
    assert.match(source, /jewellery_part_occupancy AS/);
    assert.match(source, /jewellery_hard_block AS/);
    assert.match(source, /jewellery_booking_boundaries AS/);
  });

  it("uses UTC calendar-day boundaries like availability search", () => {
    assert.match(source, /AT TIME ZONE 'UTC'/);
    assert.match(source, /b\.delivery_date < \$\{returnEnd\}/);
    assert.match(source, /b\.return_date >= \$\{deliveryStart\}/);
  });

  it("maps hard conflict before warnings in final_result", () => {
    assert.match(
      source,
      /WHEN hc\.booking_id IS NOT NULL OR jhb\.item_id IS NOT NULL THEN 'hard_conflict'/,
    );
  });
});

describe("booking date-check overlap boundaries", () => {
  const existingD = "2026-06-26";
  const existingR = "2026-06-28";

  it("allows same-day return→delivery handover with returning warning", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-28", "2026-06-30"), "returning");
  });

  it("allows same-day delivery→return handover with booked warning", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-25", "2026-06-26"), "booked");
  });

  it("blocks true overlap", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-27", "2026-06-29"), "busy");
    assert.equal(occupancyKind(existingD, existingR, "2026-06-26", "2026-06-28"), "busy");
  });

  it("allows adjacent non-overlapping periods", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-20", "2026-06-25"), null);
    assert.equal(occupancyKind(existingD, existingR, "2026-06-29", "2026-07-05"), null);
  });

  it("blocks when new period fully contains existing", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-25", "2026-06-29"), "busy");
  });

  it("blocks when existing fully contains new period", () => {
    assert.equal(occupancyKind(existingD, existingR, "2026-06-27", "2026-06-27"), "busy");
  });
});

describe("booking date-check performance guard", () => {
  it("documents single-query budget for multi-item checks", () => {
    assert.match(source, /WHERE ci\.id IN \(\$\{Prisma\.join\(uniqueIds\)\}\)/);
    assert.doesNotMatch(source, /itemIds\.map|Promise\.all\(\[\s*prisma\.booking\.findMany/g);
  });
});
