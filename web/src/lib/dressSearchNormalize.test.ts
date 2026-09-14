import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeDressSearchQuery } from "./dress";

describe("normalizeDressSearchQuery", () => {
  it("strips display_name decorations used in the booking picker", () => {
    assert.equal(
      normalizeDressSearchQuery("FIROZI PEACOCK MULTI (Crop Top) · Size M"),
      "FIROZI PEACOCK MULTI",
    );
    assert.equal(
      normalizeDressSearchQuery("HIGHLIGHT CUTWORK (Lehenga) | Size Free"),
      "HIGHLIGHT CUTWORK",
    );
    assert.equal(normalizeDressSearchQuery("MULTI RAJ #2"), "MULTI RAJ");
    assert.equal(normalizeDressSearchQuery("  plain name  "), "plain name");
  });
});
