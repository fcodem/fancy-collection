import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allLimit, mapLimit } from "./concurrency";
import {
  beginPrismaQuery,
  endPrismaQuery,
  getMaxConcurrentQueries,
  getInFlightQueries,
  resetMaxConcurrentQueries,
} from "./prismaConcurrency";

describe("bounded concurrency", () => {
  it("never runs more than the limit at once", async () => {
    let active = 0;
    let peak = 0;
    const task = () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return active;
    };
    await allLimit(
      Array.from({ length: 10 }, () => task()),
      3,
    );
    assert.ok(peak <= 3, `peak ${peak} exceeded limit 3`);
  });

  it("preserves input order in results", async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      await new Promise((r) => setTimeout(r, (6 - n) * 2));
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
  });

  it("runs everything when tasks fit under the limit", async () => {
    const out = await allLimit([async () => "a", async () => "b"], 5);
    assert.deepEqual(out, ["a", "b"]);
  });
});

describe("prisma concurrency gauge", () => {
  it("tracks in-flight and high-water mark", () => {
    resetMaxConcurrentQueries();
    const start = getMaxConcurrentQueries();
    beginPrismaQuery();
    beginPrismaQuery();
    assert.equal(getInFlightQueries(), 2);
    assert.ok(getMaxConcurrentQueries() >= start + 2);
    endPrismaQuery();
    endPrismaQuery();
    assert.equal(getInFlightQueries(), 0);
  });

  it("never drops in-flight below zero", () => {
    endPrismaQuery();
    endPrismaQuery();
    assert.ok(getInFlightQueries() >= 0);
  });
});
