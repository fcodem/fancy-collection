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
    // Dress photos help packing staff avoid mix-ups; keep select narrow (photo fields only).
    assert.match(service, /photo: true/);
    assert.match(service, /catalogPhotoRef/);
    assert.match(service, /visibleItemIds/);
  });

  it("filters whole Men / Women / Jewellery divisions in SQL", () => {
    assert.match(service, /parsePackingDivisionFilter/);
    assert.match(service, /divisionCategories/);
    assert.match(service, /category: \{ in: divisionCategories \}/);
    assert.match(service, /subCategory: \{ in: divisionCategories \}/);
  });

  it("loads active custom orders only for the visible booking page", () => {
    const start = service.indexOf("orders: {");
    const orderSelect = service.slice(start, service.indexOf("legacyItem:", start));
    assert.match(orderSelect, /where: \{ status: "active" \}/);
    assert.doesNotMatch(orderSelect, /photo: true/);
  });

  it("shows dress thumbnails in the packing list UI", () => {
    assert.match(client, /BookingPhotoThumb/);
    assert.match(client, /item\.photo/);
  });

  it("exposes whole-division Men / Women / Jewellery selection", () => {
    assert.match(client, /Division — pack one full community/);
    assert.match(client, /packingDivisionFilterValue/);
    assert.match(client, /All divisions/);
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
