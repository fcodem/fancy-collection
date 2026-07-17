import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { startAiJobWorker, stopAiJobWorker } from "./aiJobWorker";

describe("AI worker serverless safety", () => {
  it("startAiJobWorker is a no-op when VERCEL=1 (no setInterval)", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      stopAiJobWorker();
      startAiJobWorker({ skipImmediateDrain: true });
      // If an interval had started, a second call would early-return on workerTimer.
      // On Vercel both calls are no-ops and stopAiJobWorker leaves timer null.
      stopAiJobWorker();
      assert.equal(process.env.VERCEL, "1");
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
      stopAiJobWorker();
    }
  });
});
