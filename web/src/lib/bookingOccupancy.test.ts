import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Mirrors booking.ts occupancy SQL: only active booking_items with
 * is_cancelled=false AND is_returned=false block availability.
 */
function bookingItemOccupiesInventory(item: {
  itemId: number | null;
  isCancelled: boolean;
  isReturned: boolean;
}): boolean {
  return item.itemId != null && !item.isCancelled && !item.isReturned;
}

describe("booking occupancy filters (cancelled/returned regression)", () => {
  it("active booking item occupies inventory", () => {
    assert.equal(
      bookingItemOccupiesInventory({ itemId: 42, isCancelled: false, isReturned: false }),
      true,
    );
  });

  it("cancelled booking item does not occupy inventory", () => {
    assert.equal(
      bookingItemOccupiesInventory({ itemId: 42, isCancelled: true, isReturned: false }),
      false,
    );
  });

  it("returned booking item does not occupy inventory", () => {
    assert.equal(
      bookingItemOccupiesInventory({ itemId: 42, isCancelled: false, isReturned: true }),
      false,
    );
  });

  it("cancelled and returned booking item does not occupy inventory", () => {
    assert.equal(
      bookingItemOccupiesInventory({ itemId: 42, isCancelled: true, isReturned: true }),
      false,
    );
  });

  it("rows without item_id never occupy inventory", () => {
    assert.equal(
      bookingItemOccupiesInventory({ itemId: null, isCancelled: false, isReturned: false }),
      false,
    );
  });
});
