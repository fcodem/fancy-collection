import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("booking record data service", () => {
  it("uses explicit select for core booking query", () => {
    const source = read("src/lib/services/bookingRecordData.ts");
    assert.match(source, /bookingRecordCoreSelect/);
    assert.match(source, /select:\s*bookingRecordCoreSelect/);
    assert.doesNotMatch(source, /bookingItems:\s*true/);
    assert.doesNotMatch(source, /include:\s*\{\s*item:\s*true/);
  });

  it("does not load private media or AI fields in core select", () => {
    const source = read("src/lib/services/bookingRecordData.ts");
    assert.doesNotMatch(source, /idPhoto/);
    assert.doesNotMatch(source, /embedding/);
    assert.doesNotMatch(source, /fingerprint/);
    assert.doesNotMatch(source, /enhancedPhoto/);
    assert.doesNotMatch(source, /privateMedia/);
  });

  it("streams warnings outside the record page shell", () => {
    const page = read("src/app/booking/[id]/page.tsx");
    assert.match(page, /BookingWarningsAsync/);
    assert.match(page, /Suspense/);
    assert.match(page, /BookingWarningsSkeleton/);
    assert.doesNotMatch(page, /await loadWarningItemsForBooking/);
    assert.doesNotMatch(page, /await loadBookingRecordWarnings/);
  });

  it("caches core after auth with shop revision key", () => {
    const cache = read("src/lib/services/bookingRecordCache.ts");
    assert.match(cache, /booking-record-core/);
    assert.match(cache, /getFreshShopRevision/);
    assert.match(cache, /memoryCachedQuery/);
  });

  it("warning query uses boundary dates only", () => {
    const warnings = read("src/lib/bookingWarnings.ts");
    assert.match(warnings, /fetchWarningBoundaryBookings/);
    assert.match(warnings, /returnDate: deliveryQ/);
    assert.match(warnings, /deliveryDate: returnQ/);
    assert.match(warnings, /warningBookingSelect/);
    assert.doesNotMatch(warnings, /include:\s*\{\s*bookingItems:\s*\{\s*include:\s*\{\s*item:\s*true/);
  });

  it("excludes cancelled and returned items from visible item ids", () => {
    const warnings = read("src/lib/bookingWarnings.ts");
    assert.match(warnings, /!bi\.isCancelled/);
    assert.match(warnings, /!bi\.isReturned/);
  });

  it("panel limits concurrent reads to two", () => {
    const panel = read("src/lib/services/bookingPanelData.ts");
    assert.match(panel, /AsyncSemaphore\(2\)/);
    assert.match(panel, /limitedRead/);
  });

  it("customer slips page does not import PDF generators", () => {
    const slips = read("src/app/booking/[id]/customer-slips/page.tsx");
    assert.doesNotMatch(slips, /generateBookingSlipPdf/);
    assert.doesNotMatch(slips, /pdfBrowserPool/);
    assert.doesNotMatch(slips, /chromium/i);
  });

  it("cancellation modal is dynamically imported", () => {
    const client = read("src/components/BookingViewClient.tsx");
    assert.match(client, /dynamic\(\(\) => import\("@\/components\/DeliveredCancelBooking"\)/);
  });

  it("record route has loading skeleton and error boundary", () => {
    assert.match(read("src/app/booking/[id]/loading.tsx"), /BookingRecordLoadingSkeleton/);
    assert.ok(fs.existsSync(path.join(root, "src/app/booking/[id]/error.tsx")));
  });

  it("search API debounces short queries and caches results", () => {
    const route = read("src/app/api/search-booking/route.ts");
    assert.match(route, /queryText\.length < 2/);
    assert.match(route, /memoryCachedQuery/);
    assert.match(route, /createPerfTimer/);
  });
});

describe("booking record perf instrumentation", () => {
  it("documents safe perf fields without PII", () => {
    const perf = read("src/lib/services/bookingRecordPerf.ts");
    assert.match(perf, /never logs PII/);
    assert.doesNotMatch(perf, /customerName/);
    assert.doesNotMatch(perf, /phone/);
    assert.doesNotMatch(perf, /qrToken/);
  });
});
