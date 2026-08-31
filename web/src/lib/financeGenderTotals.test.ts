import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  financeItemCategoryKeyForBookingItem,
} from "./financeGenderTotals";

describe("financeItemCategoryKey", () => {
  it("uses real dress categories instead of Men/Women/Jewellery buckets", () => {
    assert.equal(
      financeItemCategoryKeyForBookingItem({
        category: "Other",
        dressName: "RANI",
        item: { category: "Crop Top", subCategory: "" },
      }),
      "Crop Top",
    );
    assert.equal(
      financeItemCategoryKeyForBookingItem({
        category: "Sherwani",
        dressName: "ROYAL",
        item: { category: "Sherwani", subCategory: "" },
      }),
      "Sherwani",
    );
    assert.equal(
      financeItemCategoryKeyForBookingItem({
        category: "Necklace",
        dressName: "KUNDAN",
        item: { category: "Necklace", subCategory: "" },
      }),
      "Necklace",
    );
  });
});
