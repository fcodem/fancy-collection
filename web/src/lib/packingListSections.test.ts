import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countPackingItemsByDivision,
  packingDivisionForListItem,
  packingSectionsForRows,
} from "./packingListSections";
import { PACKING_DIVISIONS } from "./packingDivision";

const lists = {
  mens: ["Sherwani", "Indowestern"],
  womens: ["Lehenga", "Crop Top", "Saree"],
  jewellery: ["Necklace", "Kundan Jewellery", "Bangles"],
};

describe("packingListSections", () => {
  it("assigns every dress and jewellery line to exactly one section", () => {
    const rows = [
      {
        id: 1,
        items: [
          { category: "Crop Top", dress_name: "RANI", sub_category: "" },
          { category: "Sherwani", dress_name: "ROYAL", sub_category: "" },
          { category: "Necklace", dress_name: "KUNDAN", sub_category: "" },
          { category: "Other", dress_name: "BLUE LEHENGA", sub_category: "" },
          { category: "Other", dress_name: "POLKI SET", sub_category: "" },
        ],
      },
    ];

    const counts = countPackingItemsByDivision(rows, lists);
    assert.equal(counts.mens, 1);
    assert.equal(counts.womens, 2);
    assert.equal(counts.jewellery, 2);
    assert.equal(counts.mens + counts.womens + counts.jewellery, rows[0]!.items!.length);

    const sections = packingSectionsForRows(rows, lists, PACKING_DIVISIONS);
    const visibleItems = sections.flatMap((section) =>
      section.rows.flatMap((booking) => booking.items ?? []),
    );
    assert.equal(visibleItems.length, rows[0]!.items!.length);
  });

  it("uses inventory-backed categories for section assignment", () => {
    assert.equal(
      packingDivisionForListItem(
        { category: "Necklace", dress_name: "SET 1", sub_category: "" },
        lists,
      ),
      "jewellery",
    );
    assert.equal(
      packingDivisionForListItem(
        { category: "Other", dress_name: "SET 1", sub_category: "Necklace" },
        lists,
      ),
      "jewellery",
    );
  });
});
