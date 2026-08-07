import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapseMensAvailabilityItems,
  mensSizeAvailabilityKey,
  mergeAvailabilityItemsById,
} from "./mensAvailabilityCollapse";

describe("mensAvailabilityCollapse", () => {
  it("builds a stable product+size key", () => {
    assert.equal(
      mensSizeAvailabilityKey({ name: "Manyavar Coading #2", category: "Sherwani", size: "40" }),
      "manyavar coading|sherwani|40",
    );
  });

  it("collapses men's units to one row per size", () => {
    const collapsed = collapseMensAvailabilityItems([
      {
        id: 1,
        name: "Manyavar Coading",
        category: "Sherwani",
        size: "40",
        free_quantity: 1,
        total_quantity: 1,
      },
      {
        id: 2,
        name: "Manyavar Coading #2",
        category: "Sherwani",
        size: "40",
        free_quantity: 1,
        total_quantity: 1,
      },
      {
        id: 3,
        name: "Manyavar Coading",
        category: "Sherwani",
        size: "42",
        free_quantity: 1,
        total_quantity: 1,
      },
      {
        id: 9,
        name: "Sparkle",
        category: "Lehenga",
        size: "M",
        free_quantity: 1,
        total_quantity: 1,
      },
    ]);
    assert.equal(collapsed.length, 3);
    const size40 = collapsed.find((i) => i.size === "40");
    const size42 = collapsed.find((i) => i.size === "42");
    assert.equal(size40?.free_quantity, 2);
    assert.equal(size40?.id, 1);
    assert.equal(size42?.free_quantity, 1);
    assert.equal(collapsed.filter((i) => i.category === "Lehenga").length, 1);
  });

  it("dedupes load-more appends by id", () => {
    const merged = mergeAvailabilityItemsById(
      [{ id: 1 }, { id: 2 }],
      [{ id: 2 }, { id: 3 }],
    );
    assert.deepEqual(
      merged.map((i) => i.id),
      [1, 2, 3],
    );
  });
});
