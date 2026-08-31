import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortByDeliverySchedule } from "./bookingDeliverySort";

describe("sortByDeliverySchedule", () => {
  it("sorts by delivery date ascending", () => {
    const rows = sortByDeliverySchedule([
      { id: 2, delivery_date: "20/11/2026", delivery_time: "12:00 Noon" },
      { id: 1, delivery_date: "13/11/2026", delivery_time: "12:00 Noon" },
    ]);
    assert.equal(rows[0]?.id, 1);
    assert.equal(rows[1]?.id, 2);
  });

  it("sorts by delivery time within the same day", () => {
    const rows = sortByDeliverySchedule([
      { id: 2, delivery_date: "13/11/2026", delivery_time: "4:00 PM" },
      { id: 1, delivery_date: "13/11/2026", delivery_time: "8:00 AM" },
      { id: 3, delivery_date: "13/11/2026", delivery_time: "12:00 Noon" },
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      [1, 3, 2],
    );
  });
});
