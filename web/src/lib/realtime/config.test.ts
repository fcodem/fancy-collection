import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POLL_INTERVAL_MS } from "./config";
import type { ShopEventType } from "./types";

describe("realtime config (perf regression)", () => {
  it("default poll interval is 60 seconds when env unset", () => {
    assert.equal(POLL_INTERVAL_MS, 60_000);
  });

  it("keeps nav.refresh and shop.changed as distinct event types", () => {
    const nav: ShopEventType = "nav.refresh";
    const changed: ShopEventType = "shop.changed";
    assert.notEqual(nav, changed);
  });
});
