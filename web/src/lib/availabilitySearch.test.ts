import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeAvailabilityCursor,
  encodeAvailabilityCursor,
} from "./availabilityCursor";
import {
  availablePartsForItem,
  mergeBookedParts,
} from "./jewelleryParts";

const source = readFileSync(
  join(process.cwd(), "src", "lib", "services", "availabilitySearch.ts"),
  "utf8",
);

function candidateCapFor(limit: number) {
  return Math.min(500, Math.max(50, (limit + 1) * 25));
}

describe("availability search helpers", () => {
  it("exports limit constants and candidate cap formula", () => {
    assert.match(source, /export const DEFAULT_LIMIT = 30/);
    assert.match(source, /export const MAX_LIMIT = 50/);
    assert.match(source, /export const CANDIDATE_CAP = 500/);
    assert.match(
      source,
      /Math\.min\(CANDIDATE_CAP, Math\.max\(50, \(limit \+ 1\) \* 25\)\)/,
    );
    assert.equal(candidateCapFor(30), Math.min(500, Math.max(50, 31 * 25)));
    assert.equal(candidateCapFor(1), 50);
    assert.equal(candidateCapFor(50), 500);
  });

  it("exports needsJewelleryOccupancy with men/women skip rules", () => {
    assert.match(source, /export function needsJewelleryOccupancy/);
    assert.match(source, /if \(group === "men" \|\| group === "women"\) return false/);
    assert.match(source, /if \(group === "jewellery" \|\| group === "bridal"\) return true/);
    assert.match(source, /if \(itemType && itemType !== "jewellery"\) return false/);
  });
});

describe("single-query availability contracts", () => {
  it("uses the required bounded CTE pipeline", () => {
    for (const cte of [
      "candidate_inventory",
      "active_booking_occupancy",
      "legacy_booking_occupancy",
      "same_day_return_warnings",
      "same_day_delivery_warnings",
      "jewellery_part_occupancy",
      "final_availability",
    ]) {
      assert.match(source, new RegExp(`${cte} AS`));
    }
    assert.equal((source.match(/prisma\.\$queryRaw/g) ?? []).length, 2);
    assert.match(source, /LIMIT \$\{candidateCap\}/);
    assert.match(source, /LIMIT \$\{limit \+ 1\}/);
    assert.match(source, /WHERE false/);
    assert.match(source, /thumbnail_photo AS thumbnail/);
    assert.match(source, /photo: row\.thumbnail/);
    assert.match(source, /jewelleryChecks && row\.itemType === "jewellery"/);
    assert.doesNotMatch(source, /findMany|original_photo|enhanced_photo|embedding|recognition/i);
  });

  it("filters candidates before occupancy and excludes maintenance states", () => {
    assert.ok(source.indexOf("candidate_inventory AS") < source.indexOf("active_booking_occupancy AS"));
    assert.match(source, /status NOT IN \('maintenance', 'repair', 'cleaning'\)/);
    assert.match(source, /ORDER BY ci\.category, ci\.name, ci\.id/);
    assert.match(source, /ci\.category =/);
    assert.match(source, /ci\.sub_category/);
    assert.match(source, /ci\.size/);
    assert.match(source, /ci\.item_type/);
  });

  it("preserves modern, legacy, cancellation, returned and edit rules", () => {
    assert.match(source, /bi\.is_cancelled = false/);
    assert.match(source, /bi\.is_returned = false/);
    assert.match(
      source,
      /NOT EXISTS \(\s*SELECT 1 FROM booking_items bi[\s\S]*bi\.item_id = b\.item_id[\s\S]*bi\.is_cancelled = false[\s\S]*bi\.is_returned = false/,
    );
    assert.match(source, /b\.id <> \$\{excludeId\}/);
    assert.match(source, /occupancy_kind = 'returning'/);
    assert.match(source, /occupancy_kind = 'booked'/);
    assert.match(source, /occupancy_kind = 'busy'/);
  });

  it("records query and serialize timing in audit", () => {
    assert.match(source, /queryMs/);
    assert.match(source, /serializeMs/);
    assert.match(source, /includeTotal/);
    assert.match(source, /SELECT COUNT\(\*\)::bigint AS count FROM final_availability/);
  });

  it("cursor contains the complete category/name/id sort tuple", () => {
    const cursor = { category: "Sherwani", name: "Blue", id: 17 };
    assert.deepEqual(
      decodeAvailabilityCursor(encodeAvailabilityCursor(cursor)),
      cursor,
    );
    assert.equal(decodeAvailabilityCursor("bad"), null);
  });

  it("keeps unbooked jewellery parts available and excludes booked parts", () => {
    const item = {
      hasNecklace: true,
      hasEarrings: true,
      hasTeeka: true,
      hasPasa: false,
    };
    const booked = mergeBookedParts(item, [
      {
        itemId: 1,
        pickNecklace: true,
        pickEarrings: false,
        pickTeeka: true,
        pickPasa: false,
      },
    ], 1);
    assert.deepEqual([...booked].sort(), ["necklace", "teeka"]);
    assert.deepEqual(availablePartsForItem(item, booked), ["earrings"]);
  });
});
