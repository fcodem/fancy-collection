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
    assert.equal((source.match(/prisma\.\$queryRaw/g) ?? []).length, 1);
    assert.match(source, /LIMIT \$\{limit \+ 1\}/);
    assert.doesNotMatch(source, /findMany|original_photo|enhanced_photo|embedding|recognition/i);
  });

  it("filters candidates before occupancy and excludes maintenance states", () => {
    assert.ok(source.indexOf("candidate_inventory AS") < source.indexOf("active_booking_occupancy AS"));
    assert.match(source, /status NOT IN \('maintenance', 'repair', 'cleaning'\)/);
    assert.match(source, /ci\.category =/);
    assert.match(source, /ci\.sub_category/);
    assert.match(source, /ci\.size/);
    assert.match(source, /ci\.item_type/);
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
