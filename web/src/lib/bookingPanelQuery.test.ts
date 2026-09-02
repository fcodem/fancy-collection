import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPanelActiveWhere,
  bookingPanelStatsWhere,
} from "./bookingPanelQuery";

const augustDelivery = { id: { in: [1, 2, 3] } };

describe("bookingPanelActiveWhere", () => {
  it("filters by delivery month only for full-year view", () => {
    const where = bookingPanelActiveWhere(augustDelivery, null);
    assert.deepEqual(where, {
      ...augustDelivery,
      status: { in: ["booked", "delivered"] },
    });
  });

  it("always includes outstanding delivered bookings when a month is selected", () => {
    const where = bookingPanelActiveWhere(augustDelivery, 9);
    assert.ok(Array.isArray(where.OR));
    assert.equal(where.OR?.length, 2);
    assert.deepEqual(where.OR?.[0], {
      ...augustDelivery,
      status: { in: ["booked", "delivered"] },
    });
    assert.deepEqual(where.OR?.[1], {
      status: { in: ["delivered", "incomplete_return"] },
    });
  });
});

describe("bookingPanelStatsWhere", () => {
  it("extends stats to outstanding dresses when filtering a single month", () => {
    const where = bookingPanelStatsWhere(augustDelivery, 9);
    assert.ok(Array.isArray(where.OR));
    assert.deepEqual(where.OR?.[1], {
      status: { in: ["delivered", "incomplete_return"] },
    });
  });
});
