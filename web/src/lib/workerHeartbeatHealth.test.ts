import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cronScheduleToIntervalMs,
  deriveWorkerHealth,
  buildHeartbeatThresholds,
} from "./dressChecker/workerHealthLogic";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("cron schedule → expected interval", () => {
  it("parses */15 as 15 minutes", () => {
    assert.equal(cronScheduleToIntervalMs("*/15 * * * *"), 15 * MINUTE);
  });

  it("parses * * * * * as 1 minute", () => {
    assert.equal(cronScheduleToIntervalMs("* * * * *"), MINUTE);
  });

  it("parses hourly step schedules", () => {
    assert.equal(cronScheduleToIntervalMs("5 */2 * * *"), 2 * HOUR);
  });

  it("treats daily fixed schedules as 24 hours", () => {
    assert.equal(cronScheduleToIntervalMs("0 5 * * *"), 24 * HOUR);
  });
});

describe("AI worker heartbeat health derivation", () => {
  const interval = 15 * MINUTE;
  const thresholds = buildHeartbeatThresholds(interval);
  const now = Date.parse("2026-07-19T12:00:00.000Z");

  it("fresh heartbeat → HEALTHY", () => {
    const h = deriveWorkerHealth({
      heartbeatAt: new Date(now - 5 * MINUTE),
      now,
      expectedIntervalMs: interval,
      mode: "SERVERLESS_WORKER",
    });
    assert.equal(h.status, "HEALTHY");
    assert.equal(h.healthy, true);
    assert.match(h.displayLabel, /^HEALTHY/);
    assert.doesNotMatch(h.displayLabel, /ONLINE|OK\b/);
  });

  it("failures with recent heartbeat → DEGRADED", () => {
    const h = deriveWorkerHealth({
      heartbeatAt: new Date(now - 5 * MINUTE),
      now,
      expectedIntervalMs: interval,
      mode: "SERVERLESS_WORKER",
      queue: { failed: 2, deadLetter: 16, stale: 7 },
    });
    assert.equal(h.status, "DEGRADED");
    assert.equal(h.healthy, false);
    assert.match(h.displayLabel, /^DEGRADED/);
  });

  it("old heartbeat beyond 2 intervals → STALE", () => {
    // 2*15m + grace(~4m) ≈ 34m; 45m should be STALE but under offline threshold
    const h = deriveWorkerHealth({
      heartbeatAt: new Date(now - 45 * MINUTE),
      now,
      expectedIntervalMs: interval,
      mode: "SERVERLESS_WORKER",
    });
    assert.equal(h.status, "STALE");
    assert.equal(h.displayLabel, "STALE");
    assert.equal(h.healthy, false);
  });

  it("very old heartbeat (20h) → OFFLINE, never ONLINE", () => {
    const h = deriveWorkerHealth({
      heartbeatAt: new Date(now - 20 * HOUR),
      now,
      expectedIntervalMs: interval,
      mode: "SERVERLESS_WORKER",
    });
    assert.equal(h.status, "OFFLINE");
    assert.equal(h.displayLabel, "OFFLINE");
    assert.equal(h.healthy, false);
    assert.ok(20 * HOUR > thresholds.offlineAfterMs);
  });

  it("missing heartbeat → OFFLINE", () => {
    const h = deriveWorkerHealth({
      heartbeatAt: null,
      now,
      expectedIntervalMs: interval,
    });
    assert.equal(h.status, "OFFLINE");
  });

  it("disabled flag → DISABLED", () => {
    const h = deriveWorkerHealth({
      heartbeatAt: new Date(now - MINUTE),
      now,
      expectedIntervalMs: interval,
      disabled: true,
    });
    assert.equal(h.status, "DISABLED");
    assert.equal(h.displayLabel, "DISABLED");
  });

  it("exposes next expected run from last heartbeat + interval", () => {
    const last = new Date(now - 5 * MINUTE);
    const h = deriveWorkerHealth({
      heartbeatAt: last,
      now,
      expectedIntervalMs: interval,
    });
    assert.equal(h.nextExpectedRunAt, new Date(last.getTime() + interval).toISOString());
  });
});

describe("website health stays independent of AI outage", () => {
  it("public health keeps website ok tied to database only", () => {
    const src = read("src/lib/dressChecker/publicHealthStatus.ts");
    assert.match(src, /const websiteOk = dbOk;/);
    assert.match(src, /ok: websiteOk,/);
    assert.match(src, /AI indexing is offline or stale/);
    assert.match(src, /durable\.status === "STALE"/);
    assert.doesNotMatch(src, /status: durable\.status === "OFFLINE" \? "OFFLINE" : "OK"/);
  });

  it("does not hard-code worker ONLINE/OK labels in heartbeat module", () => {
    const src = read("src/lib/dressChecker/workerHeartbeat.ts");
    assert.doesNotMatch(src, /ONLINE \(cron\)|ONLINE \(local\)/);
    assert.doesNotMatch(src, /26 \* 60 \* 60 \* 1000/);
    assert.match(src, /deriveWorkerHealth/);
    assert.match(src, /resolveAiWorkerExpectedIntervalMs/);
  });
});

describe("expired lease recovery and owner controls", () => {
  it("recovers expired processing leases without inventing duplicate jobs", () => {
    const queue = read("src/lib/dressChecker/aiJobQueue.ts");
    assert.match(queue, /export async function recoverExpiredProcessingLeases/);
    assert.match(queue, /Lease expired/);
    assert.match(queue, /AI_JOB_STATUS\.RETRYING/);
    const safety = read("src/lib/dressChecker/deploymentSafety.ts");
    assert.match(safety, /recoverExpiredProcessingLeases\(STUCK_JOB_THRESHOLD_MS\)/);
  });

  it("exposes owner actions for lease recovery, safe retry, dead letter, trigger", () => {
    const route = read("src/app/api/admin/ai-indexing/route.ts");
    assert.match(route, /"recover_expired_leases"/);
    assert.match(route, /"retry_safe_failed"/);
    assert.match(route, /"move_to_dead_letter"/);
    assert.match(route, /"trigger_worker_run"/);
    assert.match(route, /retrySafeFailedAiJobs/);
    assert.match(route, /moveDeterministicFailureToDeadLetter/);
  });

  it("queue stats expose ages and last successful job", () => {
    const queue = read("src/lib/dressChecker/aiJobQueue.ts");
    assert.match(queue, /oldestPendingAgeMs/);
    assert.match(queue, /oldestProcessingAgeMs/);
    assert.match(queue, /lastSuccessfulJobAt/);
  });
});

describe("AI stays off critical business paths", () => {
  it("booking and inventory mutation routes do not import the AI worker", () => {
    for (const file of [
      "src/app/api/booking/route.ts",
      "src/app/api/inventory/route.ts",
      "src/app/api/inventory/[id]/route.ts",
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /aiJobWorker|processInventoryAiProfile|@xenova\/transformers/);
    }
  });
});
