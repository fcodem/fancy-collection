import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POLL_INTERVAL_MS } from "./config";

describe("realtime config (perf regression)", () => {
  it("default poll interval is 30 seconds when env unset", () => {
    assert.equal(POLL_INTERVAL_MS, 30_000);
  });
});
