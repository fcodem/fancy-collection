import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePackingCursor, encodePackingCursor } from "./packingCursor";

const service = readFileSync(
  join(process.cwd(), "src", "lib", "services", "packingList.ts"),
  "utf8",
);
const client = readFileSync(
  join(process.cwd(), "src", "components", "PackingListClient.tsx"),
  "utf8",
);

describe("fast packing list contracts", () => {
  it("uses a complete delivery-date/time/id keyset cursor", () => {
    const cursor = {
      deliveryDate: "2026-07-18T00:00:00.000Z",
      deliveryTime: "12:00 Noon",
      id: 91,
    };
    assert.deepEqual(decodePackingCursor(encodePackingCursor(cursor)), cursor);
    assert.equal(decodePackingCursor("bad"), null);
  });

  it("bounds bookings, excludes cancelled items and filters category in SQL", () => {
    assert.match(service, /take: limit \+ 1/);
    assert.match(service, /isCancelled: false/);
    assert.match(service, /bookingItems: \{ some: \{ category, isCancelled: false \} \}/);
    assert.doesNotMatch(service, /item: \{[\s\S]*photo:/);
    assert.match(service, /visibleItemIds/);
  });

  it("loads active custom orders only for the visible booking page", () => {
    const start = service.indexOf("orders: {");
    const orderSelect = service.slice(start, service.indexOf("legacyItem:", start));
    assert.match(orderSelect, /where: \{ status: "active" \}/);
    assert.doesNotMatch(orderSelect, /photo: true/);
  });

  it("coalesces text edits, immediately saves checkboxes and supports retry", () => {
    assert.match(client, /setTimeout\(\(\) => \{[\s\S]*flushSave\(biId\)[\s\S]*\}, 500\)/);
    assert.match(client, /is_packed_ready/);
    assert.match(client, /const immediate = Object\.prototype/);
    assert.match(client, /Error · Retry/);
    assert.match(client, /method: "PATCH"/);
  });

  it("defers PDF row construction until the download click", () => {
    assert.match(client, /function buildPdfData\(\)/);
    assert.match(client, /dataFactory=\{buildPdfData\}/);
  });
});
