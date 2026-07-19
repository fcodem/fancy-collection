import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AsyncSemaphore } from "./asyncSemaphore";

describe("AsyncSemaphore", () => {
  it("never exceeds the configured concurrency limit", async () => {
    const sem = new AsyncSemaphore(2);
    let active = 0;
    let peak = 0;

    const task = () =>
      sem.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
        return active;
      });

    await Promise.all(Array.from({ length: 8 }, () => task()));
    assert.ok(peak <= 2, `peak ${peak} exceeded limit 2`);
  });

  it("returns task results in call order per slot", async () => {
    const sem = new AsyncSemaphore(1);
    const out = await Promise.all([
      sem.run(async () => 1),
      sem.run(async () => 2),
      sem.run(async () => 3),
    ]);
    assert.deepEqual(out, [1, 2, 3]);
  });
});
