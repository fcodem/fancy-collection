import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  categoryLabelKeys,
  mergeNumberMaps,
  numberMap,
  numberMapKeys,
  numberMapValues,
  numberValue,
} from "./safeNumbers";

describe("numberValue", () => {
  it("returns finite numbers", () => {
    assert.equal(numberValue(42), 42);
    assert.equal(numberValue("12.5"), 12.5);
    assert.equal(numberValue("bad"), 0);
    assert.equal(numberValue(null), 0);
    assert.equal(numberValue(undefined, 9), 9);
  });
});

describe("numberMap", () => {
  it("normalizes object maps", () => {
    assert.deepEqual(numberMap({ A: 10, B: "5" }), { A: 10, B: 5 });
  });

  it("returns empty object for null and arrays", () => {
    assert.deepEqual(numberMap(null), {});
    assert.deepEqual(numberMap([]), {});
    assert.deepEqual(numberMap("x"), {});
  });
});

describe("category helpers", () => {
  it("merges maps without throwing on invalid input", () => {
    assert.deepEqual(mergeNumberMaps({ A: 1 }, null, { B: 2 }), { A: 1, B: 2 });
    assert.deepEqual(categoryLabelKeys(null, { X: 1 }), ["X"]);
    assert.deepEqual(numberMapKeys(undefined), []);
    assert.deepEqual(numberMapValues({ Z: 3 }), [3]);
  });
});

describe("malformed payloads", () => {
  it("handles nested invalid category data safely", () => {
    const payload = {
      advance_by_category: null,
      balance_by_category: { Mens: "100", Womens: NaN },
    };
    const advance = numberMap(payload.advance_by_category);
    const balance = numberMap(payload.balance_by_category);
    const labels = categoryLabelKeys(advance, balance);
    assert.deepEqual(labels, ["Mens", "Womens"]);
    assert.equal(numberValue(balance.Mens), 100);
    assert.equal(numberValue(balance.Womens), 0);
  });
});
