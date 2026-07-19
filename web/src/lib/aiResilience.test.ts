import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("AI worker resilience contracts", () => {
  it("worker dynamically imports the model graph (deferred load)", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.doesNotMatch(worker, /^import\s+\{[^}]*\}\s+from\s+["']\.\/processInventory["']/m);
    assert.match(worker, /await import\(["']\.\/processInventory["']\)/);
  });

  it("photo-removed cleanup does not statically pull the recognition pipeline", () => {
    const indexing = read("src/lib/dressCheckerIndexing.ts");
    assert.doesNotMatch(
      indexing,
      /^import\s+\{[^}]*\}\s+from\s+["']\.\/recognitionPipeline\/processInventory["']/m,
    );
    assert.match(indexing, /await import\(\s*[\s\S]*?recognitionPipeline\/processInventory/);
  });

  it("has a deterministic-failure circuit breaker (native/ENOSPC → dead-letter fast)", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.match(worker, /ENOSPC/);
    assert.match(worker, /SIGABRT/);
    assert.match(worker, /fatalNative\s*\?\s*job\.maxRetries/);
  });

  it("claims one job atomically so two workers cannot process the same job", () => {
    const queue = read("src/lib/dressChecker/aiJobQueue.ts");
    // Atomic claim uses a conditional update / SKIP LOCKED style guard.
    assert.match(queue, /claimNextAiJob/);
    assert.match(queue, /FOR UPDATE SKIP LOCKED|updateMany|lockedBy/);
  });

  it("processes one job per drain iteration", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.match(worker, /processOneAiJob/);
  });

  it("bounds decoded pixels to guard against decompression bombs", () => {
    const preprocess = read("src/lib/siglipPreprocess.ts");
    assert.match(preprocess, /limitInputPixels/);
    assert.match(preprocess, /SIGLIP_MAX_INPUT_PIXELS/);
  });

  it("cleans temp files in finally", () => {
    const siglip = read("src/lib/siglipModel.ts");
    const backends = read("src/lib/ai/imageEmbedding/backends.ts");
    assert.match(siglip, /finally\s*\{[\s\S]*?unlink/);
    assert.match(backends, /finally\s*\{[\s\S]*?unlink/);
  });
});

describe("website health decoupled from AI", () => {
  it("website/overall health depends on the database, not AI degradation", () => {
    const dep = read("src/lib/dressChecker/publicHealthStatus.ts");
    assert.match(dep, /const websiteOk = dbOk;/);
    assert.match(dep, /ok: websiteOk,/);
    assert.match(dep, /website: websiteOk \? "OK" : "DOWN"/);
    assert.match(dep, /aiHealthy/);
    assert.match(dep, /deadLetterCount/);
    assert.match(dep, /lastSuccessfulJob/);
  });
});

describe("owner AI queue controls", () => {
  it("exposes retry-one, ignore and remove dead-letter", () => {
    const queue = read("src/lib/dressChecker/aiJobQueue.ts");
    assert.match(queue, /export async function retryOneAiJob/);
    assert.match(queue, /export async function ignoreDeadLetterAiJob/);
    assert.match(queue, /export async function removeDeadLetterAiJob/);
    assert.match(queue, /export async function recoverExpiredProcessingLeases/);
    assert.match(queue, /export async function retrySafeFailedAiJobs/);
    const route = read("src/app/api/admin/ai-indexing/route.ts");
    assert.match(route, /"retry_one"/);
    assert.match(route, /"ignore_dead_letter"/);
    assert.match(route, /"remove_dead_letter"/);
    assert.match(route, /"recover_expired_leases"/);
    assert.match(route, /"trigger_worker_run"/);
  });

  it("management-only actions never drain the queue", () => {
    const route = read("src/app/api/admin/ai-indexing/route.ts");
    assert.match(route, /managementOnly/);
  });
});

describe("inventory save stays usable when AI is offline", () => {
  it("inventory routes only enqueue AI work, never process it inline", () => {
    const create = read("src/app/api/inventory/route.ts");
    const update = read("src/app/api/inventory/[id]/route.ts");
    for (const src of [create, update]) {
      assert.doesNotMatch(src, /processInventoryAiProfile|processInventoryFingerprint/);
    }
  });
});
