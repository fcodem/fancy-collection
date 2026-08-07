import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapsePrintItemsByGroup,
  printCollapseKey,
  type PrintItemRow,
} from "./printCodesCollapse";

function item(partial: Partial<PrintItemRow> & Pick<PrintItemRow, "id" | "sku" | "name">): PrintItemRow {
  return {
    category: "Indowestern",
    size: null,
    color: null,
    inventoryGroupId: null,
    scanCodes: [],
    ...partial,
  };
}

describe("collapsePrintItemsByGroup", () => {
  it("keeps separate print rows for each size in a shared legacy group", () => {
    const groupId = "legacy-mens-group";
    const rows = [
      item({
        id: 1,
        sku: "ITM-0001",
        name: "Indo Creme Block",
        size: "38",
        inventoryGroupId: groupId,
        scanCodes: [{ id: 10, code: "QR-38", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 2,
        sku: "ITM-0002",
        name: "Indo Creme Block",
        size: "40",
        inventoryGroupId: groupId,
      }),
      item({
        id: 3,
        sku: "ITM-0003",
        name: "Indo Creme Block",
        size: "42",
        inventoryGroupId: groupId,
      }),
      item({
        id: 4,
        sku: "ITM-0004",
        name: "Indo Creme Block #2",
        size: "38",
        inventoryGroupId: groupId,
      }),
    ];

    const collapsed = collapsePrintItemsByGroup(rows);
    assert.equal(collapsed.length, 3);
    assert.deepEqual(
      collapsed.map((r) => ({ size: r.size, unitCount: r.unitCount, sku: r.sku })).sort((a, b) =>
        String(a.size).localeCompare(String(b.size)),
      ),
      [
        { size: "38", unitCount: 2, sku: "ITM-0001" },
        { size: "40", unitCount: 1, sku: "ITM-0002" },
        { size: "42", unitCount: 1, sku: "ITM-0003" },
      ],
    );
    assert.notEqual(printCollapseKey(rows[0]), printCollapseKey(rows[1]));
  });

  it("still collapses same-size multi-unit dresses to one QR row", () => {
    const groupId = "lehenga-group";
    const collapsed = collapsePrintItemsByGroup([
      item({
        id: 10,
        sku: "BR-010",
        name: "Red Bridal",
        size: "Free",
        category: "Lehenga",
        inventoryGroupId: groupId,
        scanCodes: [{ id: 1, code: "QR-A", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 11,
        sku: "BR-011",
        name: "Red Bridal #2",
        size: "Free",
        category: "Lehenga",
        inventoryGroupId: groupId,
      }),
    ]);
    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0].unitCount, 2);
    assert.equal(collapsed[0].displayName, "Red Bridal");
  });

  it("collapses men's same-name same-size units without a group id", () => {
    const collapsed = collapsePrintItemsByGroup([
      item({
        id: 1,
        sku: "ITM-1",
        name: "Sherwani A",
        category: "Sherwani",
        size: "38",
        inventoryGroupId: null,
        scanCodes: [{ id: 1, code: "QR-38", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 2,
        sku: "ITM-2",
        name: "Sherwani A #2",
        category: "Sherwani",
        size: "38",
        inventoryGroupId: null,
      }),
      item({
        id: 3,
        sku: "ITM-3",
        name: "Sherwani A",
        category: "Sherwani",
        size: "40",
        inventoryGroupId: null,
      }),
    ]);
    assert.equal(collapsed.length, 2);
    const bySize = Object.fromEntries(collapsed.map((r) => [r.size, r.unitCount]));
    assert.equal(bySize["38"], 2);
    assert.equal(bySize["40"], 1);
  });

  it("keeps separate men's sizes even when each size has its own group id", () => {
    const collapsed = collapsePrintItemsByGroup([
      item({
        id: 1,
        sku: "S-36",
        name: "Sherwani A",
        category: "Sherwani",
        size: "36",
        inventoryGroupId: "g36",
        scanCodes: [{ id: 1, code: "QR-36", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 2,
        sku: "S-38",
        name: "Sherwani A",
        category: "Sherwani",
        size: "38",
        inventoryGroupId: "g38",
        scanCodes: [{ id: 2, code: "QR-38", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 3,
        sku: "S-40",
        name: "Sherwani A",
        category: "Sherwani",
        size: "40",
        inventoryGroupId: "g40",
        scanCodes: [{ id: 3, code: "QR-40", format: "QR_CODE", isPrimary: true }],
      }),
      item({
        id: 4,
        sku: "S-42",
        name: "Sherwani A",
        category: "Sherwani",
        size: "42",
        inventoryGroupId: "g42",
        scanCodes: [{ id: 4, code: "QR-42", format: "QR_CODE", isPrimary: true }],
      }),
    ]);
    assert.equal(collapsed.length, 4);
    assert.deepEqual(
      collapsed.map((r) => r.size).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
      ["36", "38", "40", "42"],
    );
    assert.equal(new Set(collapsed.map((r) => r.scanCodes[0]?.code)).size, 4);
  });
});
