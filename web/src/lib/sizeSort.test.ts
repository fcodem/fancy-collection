import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySizeFilterSort, sizesFromDressNames, uniqueSortedSizes } from "./sizeSort";

describe("sizeSort", () => {
  it("reads sizes from dress labels", () => {
    assert.deepEqual(
      sizesFromDressNames("SHERWANI WHITE (Sherwani) · Size 38, KURTA RED (Kurta) · Size Free Size"),
      ["38", "FREE SIZE"],
    );
    assert.deepEqual(sizesFromDressNames("GOWN BLUE (Gown)"), []);
  });

  it("orders numeric sizes first, then text sizes", () => {
    assert.deepEqual(uniqueSortedSizes([["40", "Free Size"], ["36", "38"], ["44"]]), [
      "36",
      "38",
      "40",
      "44",
      "FREE SIZE",
    ]);
  });

  it("filters to one size and sorts smallest first, keeping date order for ties", () => {
    const rows = [
      { id: 1, sizes: ["42"] },
      { id: 2, sizes: ["38"] },
      { id: 3, sizes: ["40", "36"] },
      { id: 4, sizes: ["38"] },
      { id: 5, sizes: [] },
    ];
    const by = (r: (typeof rows)[number]) => r.sizes;
    assert.deepEqual(
      applySizeFilterSort(rows, by, { selected: "", sortOn: true }).map((r) => r.id),
      [3, 2, 4, 1, 5],
    );
    assert.deepEqual(
      applySizeFilterSort(rows, by, { selected: "38", sortOn: false }).map((r) => r.id),
      [2, 4],
    );
    assert.deepEqual(
      applySizeFilterSort(rows, by, { selected: "", sortOn: false }).map((r) => r.id),
      [1, 2, 3, 4, 5],
    );
  });
});
