import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStaleValueCache } from "./staleValueCache";

describe("staleValueCache", () => {
  const realDateNow = Date.now;
  let now = 1_000;

  beforeEach(() => {
    now = 1_000;
    Date.now = () => now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it("coalesces concurrent refreshes", async () => {
    let calls = 0;
    let release!: (value: string[]) => void;
    const gate = new Promise<string[]>((resolve) => {
      release = resolve;
    });
    const cache = createStaleValueCache(async () => {
      calls += 1;
      return gate;
    });
    const a = cache.get();
    const b = cache.get();
    release(["Mens"]);
    assert.deepEqual(await a, ["Mens"]);
    assert.deepEqual(await b, ["Mens"]);
    assert.equal(calls, 1);
  });

  it("returns stale successful data when refresh fails", async () => {
    let fail = false;
    let warnings = 0;
    const cache = createStaleValueCache(
      async () => {
        if (fail) throw new Error("database unavailable");
        return ["Jewellery"];
      },
      { ttlMs: 100, onRefreshError: () => warnings++ },
    );
    assert.deepEqual(await cache.get(), ["Jewellery"]);
    now += 101;
    fail = true;
    assert.deepEqual(await cache.get(), ["Jewellery"]);
    assert.equal(warnings, 1);
  });

  it("does not permanently cache a cold failure", async () => {
    let calls = 0;
    const cache = createStaleValueCache(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary");
      return ["Recovered"];
    });
    await assert.rejects(cache.get(), /temporary/);
    assert.deepEqual(await cache.get(), ["Recovered"]);
    assert.equal(calls, 2);
  });

  it("invalidation triggers one refresh and retains stale fallback", async () => {
    let calls = 0;
    const cache = createStaleValueCache(async () => [`v${++calls}`]);
    assert.deepEqual(await cache.get(), ["v1"]);
    cache.invalidate();
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    assert.deepEqual(a, ["v2"]);
    assert.deepEqual(b, ["v2"]);
    assert.equal(calls, 2);
  });
});
