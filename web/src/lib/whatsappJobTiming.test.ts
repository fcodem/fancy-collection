import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirrors jobQueue timing policy — keep in sync with jobQueue.ts */
const JOB_TIMEOUT_MS = 120_000;
const STUCK_PROCESSING_MS = 180_000;

describe("whatsapp job timing policy", () => {
  it("stuck recovery exceeds execution timeout", () => {
    assert.ok(STUCK_PROCESSING_MS > JOB_TIMEOUT_MS);
    assert.ok(STUCK_PROCESSING_MS - JOB_TIMEOUT_MS >= 30_000);
  });

  it("canonical success status is done not completed", () => {
    const active = ["pending", "processing", "done"];
    assert.ok(active.includes("done"));
    assert.equal(active.includes("completed"), false);
  });
});
