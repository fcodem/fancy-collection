import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideAiIndexingBanner } from "./aiIndexingBanner";

const healthyBase = {
  dbOk: true,
  workerStatus: "HEALTHY",
  failedJobCount: 0,
  deadLetterCount: 0,
  failedProfiles: 0,
  staleProfiles: 0,
  pendingProfiles: 0,
  readyProfiles: 25,
  queuePending: 0,
  queueProcessing: 0,
  queueRetrying: 0,
  unindexedWithPhoto: 0,
  stuckProcessing: 0,
};

describe("decideAiIndexingBanner", () => {
  it("shows info progress banner when queue is active", () => {
    const d = decideAiIndexingBanner({
      ...healthyBase,
      unindexedWithPhoto: 12,
      queuePending: 8,
      pendingProfiles: 12,
    });
    assert.match(d.banner || "", /in progress/i);
    assert.equal(d.bannerLevel, "info");
  });

  it("does not show degraded when stale profiles are being reindexed", () => {
    const d = decideAiIndexingBanner({
      ...healthyBase,
      workerStatus: "DEGRADED",
      staleProfiles: 5,
      queuePending: 3,
      unindexedWithPhoto: 5,
    });
    assert.match(d.banner || "", /in progress/i);
    assert.equal(d.bannerLevel, "info");
  });

  it("shows retry banner for failed profiles with idle queue", () => {
    const d = decideAiIndexingBanner({
      ...healthyBase,
      failedProfiles: 2,
      unindexedWithPhoto: 2,
    });
    assert.match(d.banner || "", /needs attention/i);
    assert.equal(d.bannerLevel, "warning");
  });

  it("clears banner when fully indexed", () => {
    const d = decideAiIndexingBanner(healthyBase);
    assert.equal(d.banner, null);
    assert.equal(d.aiHealthy, true);
  });
});
