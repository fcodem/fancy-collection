import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  categoryDivisionListsFromAllCategories,
  inferDivisionGroupFromLabel,
  resolveEffectiveCategory,
} from "./categoryDivision";
import { packingDivision, packingDivisionForItem } from "./packingDivision";

describe("categoryDivision", () => {
  it("routes custom other-group style names into women via inference", () => {
    assert.equal(inferDivisionGroupFromLabel("Crop Top"), "womens");
    assert.equal(inferDivisionGroupFromLabel("Sherwani"), "mens");
    assert.equal(inferDivisionGroupFromLabel("Kundan"), "jewellery");
  });

  it("builds division lists from manage-categories buckets", () => {
    const lists = categoryDivisionListsFromAllCategories({
      mens_categories: ["Sherwani"],
      womens_categories: ["Lehenga", "Crop Top"],
      jewellery_categories: ["Jewellery"],
      accessory_categories: ["Dupatta"],
      other_categories: ["Other", "Party Wear"],
    });
    assert.equal(packingDivision("Party Wear", null, null, lists), "womens");
    assert.equal(packingDivision("Crop Top", null, null, lists), "womens");
    assert.equal(packingDivision("Dupatta", null, null, lists), "womens");
  });

  it("prefers real categories over the Other placeholder", () => {
    assert.equal(resolveEffectiveCategory("Other", "Crop Top"), "Crop Top");
    assert.equal(resolveEffectiveCategory("Other", "Other", "Lehenga"), "Lehenga");
    assert.equal(
      packingDivisionForItem("Other", "Other", "RANI", "Crop Top", {
        mens: [],
        womens: ["Crop Top"],
        jewellery: [],
      }),
      "womens",
    );
  });
});
