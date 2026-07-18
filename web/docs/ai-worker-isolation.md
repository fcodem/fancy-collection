# AI worker isolation & repair (Prompt 12)

Branch: `fix/ai-worker-isolation`

## Objective

AI (dress-checker indexing) failure must never slow or crash the business
website.

## What changed

### 1. Native model graph removed from normal routes

The transformer/ONNX/Sharp recognition graph was reachable from normal routes
via static import chains:

- `inventoryOps → dressCheckerIndexing → recognitionPipeline/processInventory → … → siglipModel`
- `/api/health → deploymentSafety → aiJobWorker → processInventory → siglipModel`

Both chains are now broken with dynamic `import()` so the heavy graph loads
**only** on the worker path:

- `dressCheckerIndexing.ts` — dropped the static `processInventoryFingerprint`
  import and the `indexIdentificationFingerprint` re-export; loads them lazily in
  `runRecognitionPipeline` / `onInventoryPhotoChanged`.
- `aiJobWorker.ts` — `processInventoryAiProfile` is dynamically imported inside
  `processOneAiJob`.

`src/lib/aiWorkerIsolation.test.ts` walks the **static** import graph from
inventory/health/booking/delivery/return routes and fails the build if any of
them can statically reach `siglipModel`, `dressChecker/processInventory`,
`recognitionPipeline/processInventory`, or `ai/imageEmbedding/backends`, or
statically import `@xenova/transformers` / `onnxruntime-node`.

### 2. Website health decoupled from AI

`getPublicHealthStatus()` now reports separate statuses and the site is healthy
whenever the database is up, even if AI indexing is degraded:

```
website        OK | DOWN      (database only — the fix)
database       OK | DOWN
queue          ACTIVE | IDLE | UNKNOWN (+ pending/processing/failed/retrying/deadLetter)
worker         OK | OFFLINE
ai             OK | DEGRADED
aiHealthy      boolean
deadLetterCount number
lastSuccessfulJob timestamp | null
```

`ok` now equals website health (`dbOk`). `/api/health` still returns 200 when the
DB is up and 503 only when the DB is down.

### 3. Guards already present / reinforced

- **Circuit breaker** — native/OOM/`ENOSPC`/`SIGABRT` failures dead-letter
  immediately (`fatalNative` in `aiJobWorker.ts`), never retried indefinitely.
- **Atomic single-job claim** — `claimNextAiJob` uses a conditional
  `updateMany` guard (`count === 1`); two workers cannot process the same job.
- **One heavy job per cron invocation** — `drainAiJobQueue(1)` on the cron route.
- **Size/pixel limits** — 10 MB byte cap (`dressCheckerValidation`,
  `siglipSearch` preflight) plus a new `limitInputPixels` (40 MP) on Sharp decode
  in `siglipPreprocess.ts` to stop decompression bombs.
- **Temp cleanup** — model temp images are removed in `finally`
  (`siglipModel.ts`, `ai/imageEmbedding/backends.ts`).

### 4. Owner controls (new)

`aiJobQueue.ts` + `POST /api/admin/ai-indexing`:

- `retry_one` (single FAILED/DEAD_LETTER job → PENDING, then drains 1)
- `ignore_dead_letter` (→ CANCELLED, kept for audit)
- `remove_dead_letter` (delete record)
- existing: `resume_dead_letter` (retry safe group), `reindex_failed`,
  `repair_all`, `resume_queue`, `self_heal`, `drain_queue`.

Management-only actions (`ignore`/`remove`) never spin up the worker or drain.

## Not changed here

- `/tmp` before/after measurement and native-crash recovery behaviour under real
  memory pressure require a running worker with a large image corpus; verify on
  staging. The isolation guarantees above are enforced by the contract tests.

## Deployment design comparison

| Option | Pros | Cons |
|--------|------|------|
| **Current Vercel function** (cron `ai-job-worker`, 1 job/invocation) | No new infra; already isolated from normal routes; simple | Cold model download per cold isolate; 60s cap; shares Vercel memory limits |
| **Dedicated Vercel project** for AI worker | Independent scaling, memory, deploy cadence; failures fully quarantined | Extra project + env duplication; cross-project DB access |
| **Small external worker** (e.g. Fly/Render box) | Persistent model cache (no re-download), more RAM, long jobs, native stability | New paid infra + ops; must poll/claim jobs securely |
| **Queued on-demand service** (managed) | Scales to zero; retries/DLQ built in | Vendor lock-in; cost per job; integration work |

Recommendation: keep the current isolated cron function now (no new paid infra).
If model re-download / native crashes persist under load, move the worker to a
small external box with a warm model cache. **Do not provision paid infra
automatically.**
