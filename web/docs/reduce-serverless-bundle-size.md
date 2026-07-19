# Reduce serverless bundle size & verify Chromium isolation (Prompt 8)

Branch: `perf/reduce-serverless-bundle-size`

## Verdict

Chromium isolation is proven by both static contracts and generated NFT traces:

- Chromium/Puppeteer appears in **exactly one** serverless route: `app/api/internal/slip/render`
- Ordinary business APIs do **not** wait for Chromium; they queue durable WhatsApp/slip jobs and call the signed internal renderer only from the job processor / public regenerate paths
- Shared instrumentation no longer imports the AI worker/model graph
- Inventory create/update/delete no longer pull `@xenova/transformers` / `onnxruntime-node`

## Architecture changes

### Chromium

- Keep `pdfBrowserPool.ts` as the only importer of `@sparticuz/chromium` / `puppeteer-core`
- Keep `slipHtmlPdfDirect.server.ts` imported only by `POST /api/internal/slip/render`
- Keep `slipHtmlPdf.server.ts` as the lightweight HTTP client to that renderer
- Remove the full `puppeteer` dependency (local Chrome/Edge + `puppeteer-core` is enough)
- Trace Chromium only for `/api/internal/slip/render`
- Stop forcing Prisma engines into every `/*` and `/api/**/*` route via `outputFileTracingIncludes`

### Accidental deployment assets

- Ignore `public/uploads`, `public/booking-bills`, `public/admin-forensics` in Git and Vercel
- Add `outputFileTracingExcludes` for those directories
- Delete the local admin forensics HTML fixture from `public/`

> Note: when a developer machine already contains customer uploads under `public/uploads`, Next NFT still lists those local files in traces even with excludes. A clean Vercel/GitHub clone does not include those files, so they are not part of a reproducible deployment source. The analyzer reports both raw and deployable (runtime-data-excluded) totals.

### AI / native isolation for ordinary routes

- Move `/api/health` onto `publicHealthStatus.ts` (no worker/model graph)
- Move inventory photo-removal cleanup onto `photoRemovedCleanup.ts`
- Move `photoSearchInventory` out of `inventoryOps.ts` into `inventoryPhotoSearch.ts`
- Remove AI startup drains/self-heal imports from `instrumentation.ts` (cron/worker routes own that work)
- Prune unused `onnxruntime-node` platform binaries after install

## Measurement tooling

```bash
npm run build          # includes --assert-isolation report
npm run bundle:report  # analyze .next NFT traces
```

Scripts:

- `scripts/analyze-server-bundles.mjs`
- `scripts/prune-native-packages.mjs`

## Measured results (Windows local Next build)

| Metric | Baseline | After | Delta |
|---|---:|---:|---:|
| Chromium routes | 1 | 1 | proven isolation |
| Unique traced server files | 579.18 MB | 469.09 MB | −110.1 MB |
| Deployable unique traced files (runtime uploads excluded) | — | 243.62 MB | — |
| Largest function (raw, with local uploads) | 431.08 MB | 331.17 MB | −99.9 MB |
| Largest deployable function | — | 121.65 MB (`ai-job-worker`) | — |
| Build duration | not measured | 142.2 s | — |
| Deployed Node.js functions (production metadata) | 85 | 85 | unchanged locally |

### Heavy package routes after change

- Chromium/Puppeteer: **1** (`/api/internal/slip/render`)
- PDF packages: **1** (same route)
- AI native (`@xenova/transformers` / onnxruntime): **27** admin/cron/search/worker routes only
- Ordinary routes asserted clean: `/api/health`, `/api/inventory`, `/api/inventory/[id]`, `instrumentation`

### Top deployable files (runtime uploads excluded)

1. `@sparticuz/chromium/bin/chromium.br` (~61.8 MB) — only in the slip renderer
2. Prisma query engines (Windows local + RHEL for Vercel)
3. Sharp / libvips native binaries
4. Remaining onnxruntime binaries for the current host platform
5. Chromium swiftshader pack

## Correctness preserved

Contract tests cover:

- Chromium importer isolation
- Direct renderer importer isolation
- Trace config regression
- Full Puppeteer package removed
- Shared instrumentation free of model/worker imports
- Health route free of worker graph
- Inventory mutation free of recognition worker graph
- Booking/delivery/return still queue slips asynchronously and never import the Chromium pool

## Remaining size drivers (honest)

These remain intentionally heavy and are isolated to AI/admin/cron paths:

- `@xenova/transformers` + `onnxruntime-node`
- `sharp` native binaries used by image upload/search tooling
- Prisma engines (native Windows for local build + RHEL for Vercel)

Further reductions would require splitting AI search into a separate deployment/service, which is outside this prompt.

## Do not deploy from this branch yet

This branch stops after implementation, tests, and the bundle report. No push/merge/deploy was performed as part of Prompt 8.
