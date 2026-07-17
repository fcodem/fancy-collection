import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearMemoryCache, memoryCachedQuery } from "./perfCache";

describe("memoryCachedQuery concurrent misses", () => {
  it("deduplicates in-flight loaders for the same key", async () => {
    clearMemoryCache();
    let runs = 0;
    const p1 = memoryCachedQuery(
      ["c1"],
      async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 40));
        return 11;
      },
      20,
    );
    const p2 = memoryCachedQuery(
      ["c1"],
      async () => {
        runs += 1;
        return 22;
      },
      20,
    );
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(a, 11);
    assert.equal(b, 11);
    assert.equal(runs, 1);
    clearMemoryCache();
  });
});
