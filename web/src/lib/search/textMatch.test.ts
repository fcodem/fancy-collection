import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inventoryFieldsMatch,
  parseSearchQuery,
  textMatches,
} from "./textMatch";

describe("parseSearchQuery", () => {
  it("strips display decorations and builds compact key", () => {
    const p = parseSearchQuery("ROYAL PINK (Lehenga) · Size Free");
    assert.equal(p.trimmed, "ROYAL PINK");
    assert.equal(p.compact, "royalpink");
    assert.deepEqual(p.words, ["royal", "pink"]);
  });
});

describe("textMatches / inventoryFieldsMatch", () => {
  it("matches words across name and color", () => {
    assert.equal(
      inventoryFieldsMatch({ name: "ROYAL LEHENGA", color: "Pink" }, "ROYAL PINK"),
      true,
    );
    assert.equal(
      inventoryFieldsMatch({ name: "HIGHLIGHT CUTWORK", sku: "HC1" }, "highlightcutwork"),
      true,
    );
    assert.equal(textMatches("MULTI RAJWADA", "MULTI RAJ"), true);
    assert.equal(inventoryFieldsMatch({ name: "BLUE GOWN" }, "ROYAL PINK"), false);
  });
});
