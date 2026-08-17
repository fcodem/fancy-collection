import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packingDivision } from "./packingDivision";

describe("packingDivision", () => {
  it("classifies booking sub-categories like Crop Top as Women", () => {
    assert.equal(packingDivision("Crop Top"), "womens");
    assert.equal(packingDivision("CROP TOP"), "womens");
    assert.equal(packingDivision("Sharara"), "womens");
    assert.equal(packingDivision("Anarkali"), "womens");
  });

  it("classifies base inventory categories", () => {
    assert.equal(packingDivision("Sherwani"), "mens");
    assert.equal(packingDivision("Lehenga"), "womens");
    assert.equal(packingDivision("Kundan Jewellery"), "jewellery");
  });

  it("uses inventory sub-category when booking category is empty", () => {
    assert.equal(packingDivision("", "RANI SABESACHI", "Crop Top"), "womens");
    assert.equal(packingDivision(null, "Classic Sherwani", "Sherwani"), "mens");
  });

  it("infers from dress name keywords", () => {
    assert.equal(packingDivision("", "RANI SABESACHI CROP TOP"), "womens");
    assert.equal(packingDivision("", "Royal Sherwani Set"), "mens");
    assert.equal(packingDivision("", "Kundan Necklace Set"), "jewellery");
  });
});
