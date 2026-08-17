import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unpaidBalanceAfterDelivery } from "./bookingDetails";
import { preferDistinctDressSizes } from "./mensAvailabilityCollapse";

describe("unpaidBalanceAfterDelivery", () => {
  it("shows Paid when remaining was collected at delivery", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 1600,
      }),
      0,
    );
  });

  it("uses per-item collection when booking total was not synced", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 0,
        bookingItems: [{ itemRemainingCollected: 1600 }],
      }),
      0,
    );
  });

  it("keeps leftover when only part was collected", () => {
    assert.equal(
      unpaidBalanceAfterDelivery({
        totalRemaining: 1600,
        remainingCollected: 600,
      }),
      1000,
    );
  });
});

describe("preferDistinctDressSizes", () => {
  it("keeps every sherwani size instead of repeating the same size", () => {
    const rows = [
      { name: "HIGHLIGHT", category: "Sherwani", size: "40" },
      { name: "HIGHLIGHT #2", category: "Sherwani", size: "40" },
      { name: "HIGHLIGHT", category: "Sherwani", size: "42" },
      { name: "HIGHLIGHT", category: "Sherwani", size: "38" },
    ];
    const out = preferDistinctDressSizes(rows, 3);
    assert.deepEqual(
      out.map((r) => r.size),
      ["40", "42", "38"],
    );
  });
});
