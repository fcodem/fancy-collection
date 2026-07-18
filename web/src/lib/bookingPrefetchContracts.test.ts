import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("booking detail prefetch isolation", () => {
  it("renders every action through intent-only links", () => {
    const bookingView = source("src/components/BookingViewClient.tsx");
    assert.doesNotMatch(bookingView, /<Link(?:\s|>)/);
    assert.doesNotMatch(bookingView, /router\.prefetch/);
    assert.match(bookingView, /PrefetchOnIntentLink/);
  });

  it("intent links disable viewport prefetch", () => {
    const intentLink = source("src/components/PrefetchOnIntentLink.tsx");
    assert.match(intentLink, /prefetch=\{false\}/);
    assert.match(intentLink, /onMouseEnter/);
    assert.match(intentLink, /onFocus/);
    assert.match(intentLink, /onPointerDown/);
  });
});
