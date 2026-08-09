import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRINT_CODES_PAGE_SETTINGS,
  normalizePrintCodesPageSettings,
} from "./printCodesPageSettings";

describe("printCodesPageSettings", () => {
  it("clamps start cell and keeps known print formats", () => {
    assert.deepEqual(
      normalizePrintCodesPageSettings({
        startCol: 9,
        startRow: 0,
        printFormat: "BOTH",
        category: " Sherwani ",
        subCategory: " Normal ",
        search: " raj ",
      }),
      {
        startCol: 3,
        startRow: 1,
        printFormat: "BOTH",
        category: "Sherwani",
        subCategory: "Normal",
        search: "raj",
      },
    );
  });

  it("falls back to defaults for junk values", () => {
    assert.deepEqual(
      normalizePrintCodesPageSettings({
        startCol: Number.NaN,
        printFormat: "NOPE" as never,
      }),
      {
        ...DEFAULT_PRINT_CODES_PAGE_SETTINGS,
        startCol: 1,
        printFormat: "QR_CODE",
      },
    );
  });
});
