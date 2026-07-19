import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("AI worker resilience contracts", () => {
  it("worker dynamically imports the model graph", () => {
    assert.match(read("src/lib/dressChecker/aiJobWorker.ts"), /await import\(["']\.\/processInventory["']\)/);
  });

  it("has deterministic-failure dead-letter fast path", () => {
    assert.match(read("src/lib/dressChecker/aiJobWorker.ts"), /isDeterministicFailure/);
    assert.match(read("src/lib/dressChecker/aiJobTypes.ts"), /SIGABRT/);
  });

  it("claims one job atomically", () => {
    assert.match(read("src/lib/dressChecker/aiJobQueue.ts"), /claimNextAiJob/);
    assert.match(read("src/lib/dressChecker/aiJobQueue.ts"), /lockedBy/);
  });

  it("one heavy job per cron invocation", () => {
    assert.match(read("src/app/api/cron/ai-job-worker/route.ts"), /drainAiJobQueue\(1/);
  });

  it("enforces timeout and /tmp probes", () => {
    assert.match(read("src/lib/dressChecker/aiJobWorker.ts"), /withJobTimeout/);
    assert.match(read("src/lib/dressChecker/aiJobWorker.ts"), /measureTmpSpace/);
  });

  it("splits types, client, worker queue", () => {
    assert.doesNotMatch(read("src/lib/dressChecker/aiJobTypes.ts"), /prisma/);
    assert.doesNotMatch(read("src/lib/dressChecker/aiJobClient.ts"), /claimNextAiJob/);
    assert.match(read("src/lib/dressChecker/aiJobQueue.ts"), /claimNextAiJob/);
  });
});

describe("health and inventory isolation", () => {
  it("public health uses aiJobClient; website ok = db ok", () => {
    const dep = read("src/lib/dressChecker/publicHealthStatus.ts");
    assert.match(dep, /aiJobClient/);
    assert.match(dep, /const websiteOk = dbOk;/);
  });

  it("inventory pipeline enqueues only via aiJobClient", () => {
    const p = read("src/lib/inventoryPhotoPipeline.ts");
    assert.match(p, /aiJobClient/);
    assert.doesNotMatch(p, /aiJobWorker/);
  });
});
