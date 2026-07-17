import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cachedFetchJson, invalidateClientCache, yearMonthKey } from "./clientRequestCache";

describe("clientRequestCache", () => {
  it("yearMonthKey uses YYYY-MM", () => {
    assert.equal(yearMonthKey("2026-07-17"), "2026-07");
  });

  it("dedupes in-flight identical keys", async () => {
    invalidateClientCache();
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, calls };
    };
    const [a, b] = await Promise.all([
      cachedFetchJson("k1", fetcher, { ttlMs: 5_000 }),
      cachedFetchJson("k1", fetcher, { ttlMs: 5_000 }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
  });

  it("does not cache failures", async () => {
    invalidateClientCache();
    let calls = 0;
    await assert.rejects(() =>
      cachedFetchJson("fail", async () => {
        calls += 1;
        throw new Error("boom");
      }),
    );
    await assert.rejects(() =>
      cachedFetchJson("fail", async () => {
        calls += 1;
        throw new Error("boom");
      }),
    );
    assert.equal(calls, 2);
  });
});
