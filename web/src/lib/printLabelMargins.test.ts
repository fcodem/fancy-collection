import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRINT_LABEL_MARGINS,
  labelCellPositionWithMargins,
  normalizePrintLabelMargins,
} from "./printLabelMargins";

describe("printLabelMargins", () => {
  it("normalizes invalid values to defaults/bounds", () => {
    const m = normalizePrintLabelMargins({
      pageMarginTopMm: -5,
      pageMarginLeftMm: 999,
      labelWidthMm: 10,
    });
    assert.equal(m.pageMarginTopMm, 0);
    assert.equal(m.pageMarginLeftMm, 40);
    assert.equal(m.labelWidthMm, 40);
    assert.equal(m.labelHeightMm, DEFAULT_PRINT_LABEL_MARGINS.labelHeightMm);
  });

  it("positions first and second cells from margins", () => {
    const m = DEFAULT_PRINT_LABEL_MARGINS;
    const first = labelCellPositionWithMargins(0, m);
    const second = labelCellPositionWithMargins(1, m);
    assert.equal(first.leftMm, m.pageMarginLeftMm);
    assert.equal(first.topMm, m.pageMarginTopMm);
    assert.equal(second.leftMm, m.pageMarginLeftMm + m.labelWidthMm + m.colGapMm);
    assert.equal(second.topMm, m.pageMarginTopMm);
  });
});
