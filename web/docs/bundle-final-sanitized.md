# Server bundle trace report — final

Generated: 2026-07-19T11:19:09.790Z

## Metrics

- Deployed Node.js functions: 85
- Local function traces: 297 (202 API, 95 pages)
- Largest function: app/api/cron/ai-job-worker (121.65 MB)
- Unique traced server files: 469.09 MB
- Deployable traced server files (runtime data excluded): 243.62 MB
- Next output: 875.63 MB
- Build cache: 835.30 MB
- Shared first-load JavaScript: 1.01 MB
- Public assets: 226.40 MB
- Runtime/customer files present in traces: 215 (225.47 MB)
- Build duration: 142.2 s

## Heavy package routes

- Chromium/Puppeteer (1): app/api/internal/slip/render
- AI native (27): app/api/admin/ai/enhancement/reset-all, app/api/admin/ai/enhancement/retry, app/api/admin/ai/settings, app/api/admin/ai-debug, app/api/admin/ai-health, app/api/admin/ai-indexing, app/api/admin/dress-checker/confirm-same-dress, app/api/admin/dress-checker/corrections/export, app/api/admin/dress-checker/feedback, app/api/admin/dress-checker/lifecycle, app/api/admin/dress-checker-debug, app/api/admin/index-dress-photos, app/api/admin/inventory-ai-profile/[id]/refresh-embeddings, app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints, app/api/admin/inventory-ai-profile/[id]/refresh-metadata, app/api/admin/inventory-ai-profile/[id]/regenerate, app/api/admin/recognition/compare, app/api/admin/recognition/queue, app/api/admin/recognition/rebuild, app/api/admin/recognition/retry-failed, app/api/admin/recognition/search-diagnostics, app/api/cron/ai-job-worker, app/api/cron/ai-queue-watchdog, app/api/cron/dress-checker-repair, app/api/dress-checker/correction, app/api/inventory/duplicate-check, app/api/inventory/photo-search
- Sharp/native image (63): ../next-server, app/api/admin/ai/enhancement/reset-all, app/api/admin/ai/enhancement/retry, app/api/admin/ai/settings, app/api/admin/ai-debug, app/api/admin/ai-health, app/api/admin/ai-indexing/forensic, app/api/admin/ai-indexing, app/api/admin/dress-checker/confirm-same-dress, app/api/admin/dress-checker/corrections/export, app/api/admin/dress-checker/feedback, app/api/admin/dress-checker/lifecycle, app/api/admin/dress-checker-debug, app/api/admin/image-sync, app/api/admin/index-dress-photos, app/api/admin/inventory-ai-profile/[id]/refresh-embeddings, app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints, app/api/admin/inventory-ai-profile/[id]/refresh-metadata, app/api/admin/inventory-ai-profile/[id]/regenerate, app/api/admin/recognition/compare, app/api/admin/recognition/diagnostics, app/api/admin/recognition/queue, app/api/admin/recognition/rebuild, app/api/admin/recognition/retry-failed, app/api/admin/recognition/search-diagnostics, app/api/admin/recognition/[id]/fingerprint, app/api/admin/test-all-slips, app/api/ai-tools/catalog-generator, app/api/ai-tools/catalog-generator/save, app/api/ai-tools/image-enhancer/preview, app/api/ai-tools/image-enhancer/save, app/api/booking/date-check, app/api/booking/[id]/cancel, app/api/booking/[id]/items/[itemId]/cancel, app/api/booking/[id], app/api/booking-delivery/[id]/id-photos, app/api/booking-delivery/[id]/save, app/api/cron/ai-job-worker, app/api/cron/ai-queue-watchdog, app/api/cron/blob-cleanup, app/api/cron/dress-checker-repair, app/api/dashboard/free-items, app/api/dress-checker/correction, app/api/health, app/api/incomplete-return/[id]/resolve, app/api/inventory/duplicate-check, app/api/inventory/photo-search, app/api/inventory, app/api/inventory/[id], app/api/jewellery-selection/[id]/add, app/api/jewellery-selection/[id]/available, app/api/jewellery-selection/[id]/photo, app/api/jewellery-selection/[id]/remove, app/api/packing-list/save-item, app/api/recycle-bin, app/api/recycle-bin/[id]/restore, app/api/recycle-bin/[id]/restore-check, app/api/recycle-bin/[id], app/api/return/[id]/save, app/api/returning-today, app/api/uploads/order-photo, app/booking-delivery/[id], app/jewellery-selection/[id]
- PDF packages (1): app/api/internal/slip/render

## Top 30 largest traced deployment files

1. 61.79 MB — `node_modules/@sparticuz/chromium/bin/chromium.br`
2. 20.20 MB — `node_modules/.prisma/client/query_engine-windows.dll.node`
3. 18.23 MB — `node_modules/next/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`
4. 18.20 MB — `node_modules/@xenova/transformers/node_modules/sharp/build/Release/libvips-42.dll`
5. 18.20 MB — `node_modules/@xenova/transformers/node_modules/sharp/vendor/8.14.5/win32-x64/lib/libvips-42.dll`
6. 18.08 MB — `node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`
7. 16.73 MB — `node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node`
8. 8.87 MB — `node_modules/onnxruntime-node/bin/napi-v3/win32/arm64/onnxruntime.dll`
9. 8.84 MB — `node_modules/onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime.dll`
10. 3.41 MB — `node_modules/@sparticuz/chromium/bin/swiftshader.tar.br`
11. 1.57 MB — `.next/server/chunks/3739.js`
12. 1.29 MB — `.next/server/instrumentation.js`
13. 1.27 MB — `.next/server/chunks/9486.js`
14. 1.13 MB — `node_modules/@xenova/transformers/node_modules/sharp/build/Release/libglib-2.0-0.dll`
15. 1.13 MB — `node_modules/@xenova/transformers/node_modules/sharp/vendor/8.14.5/win32-x64/lib/libglib-2.0-0.dll`
16. 1.03 MB — `node_modules/@sparticuz/chromium/bin/al2023.tar.br`
17. 894.30 KB — `.next/server/chunks/7664.js`
18. 872.61 KB — `.next/server/chunks/8275.js`
19. 865.85 KB — `.next/server/chunks/5453.js`
20. 854.98 KB — `.next/server/chunks/763.js`
21. 803.22 KB — `node_modules/next/dist/compiled/next-devtools/index.js`
22. 617.93 KB — `node_modules/@tootallnate/quickjs-emscripten/dist/generated/emscripten-module.WASM_RELEASE_SYNC.js`
23. 534.69 KB — `node_modules/onnxruntime-web/dist/ort-web.node.js`
24. 530.76 KB — `node_modules/next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js`
25. 530.75 KB — `node_modules/next/dist/compiled/next-server/app-page-experimental.runtime.prod.js`
26. 513.48 KB — `node_modules/next/dist/compiled/edge-runtime/index.js`
27. 506.34 KB — `node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js`
28. 506.33 KB — `node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js`
29. 423.00 KB — `node_modules/next/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node`
30. 415.47 KB — `node_modules/react-dom/cjs/react-dom-server.edge.development.js`

## Top 30 largest function traces

1. 121.65 MB (482 files) — `app/api/cron/ai-job-worker`
2. 121.65 MB (482 files) — `app/api/cron/ai-queue-watchdog`
3. 121.65 MB (482 files) — `app/api/cron/dress-checker-repair`
4. 120.70 MB (468 files) — `app/api/admin/ai-health`
5. 120.70 MB (468 files) — `app/api/admin/ai/settings`
6. 120.70 MB (468 files) — `app/api/admin/recognition/rebuild`
7. 120.70 MB (468 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints`
8. 120.70 MB (468 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-embeddings`
9. 120.70 MB (468 files) — `app/api/admin/ai/enhancement/reset-all`
10. 120.70 MB (468 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-metadata`
11. 120.70 MB (468 files) — `app/api/admin/inventory-ai-profile/[id]/regenerate`
12. 120.70 MB (468 files) — `app/api/admin/ai/enhancement/retry`
13. 120.70 MB (468 files) — `app/api/admin/recognition/retry-failed`
14. 120.70 MB (468 files) — `app/api/admin/recognition/queue`
15. 120.37 MB (473 files) — `app/api/inventory/photo-search`
16. 120.37 MB (473 files) — `app/api/admin/recognition/search-diagnostics`
17. 120.37 MB (468 files) — `app/api/admin/ai-debug`
18. 120.37 MB (468 files) — `app/api/admin/dress-checker-debug`
19. 120.34 MB (466 files) — `app/api/admin/ai-indexing`
20. 120.32 MB (462 files) — `app/api/dress-checker/correction`
21. 120.32 MB (462 files) — `app/api/admin/dress-checker/corrections/export`
22. 120.31 MB (460 files) — `app/api/admin/dress-checker/lifecycle`
23. 120.31 MB (460 files) — `app/api/admin/index-dress-photos`
24. 120.31 MB (459 files) — `app/api/inventory/duplicate-check`
25. 120.27 MB (460 files) — `app/api/admin/dress-checker/feedback`
26. 120.27 MB (460 files) — `app/api/admin/dress-checker/confirm-same-dress`
27. 119.09 MB (243 files) — `app/api/admin/recognition/compare`
28. 74.05 MB (937 files) — `app/api/internal/slip/render`
29. 61.47 MB (419 files) — `app/booking-delivery/[id]`
30. 61.04 MB (413 files) — `app/jewellery-selection/[id]`

## Largest public files

1. 213.41 KB — `public/icon-192x192.png`
2. 213.41 KB — `public/icon-512x512.png`
3. 213.41 KB — `public/images/fancy-collection-logo.png`
4. 135.72 KB — `public/images/fancy-collection-brand.png`
5. 69.06 KB — `public/sw.js`
6. 41.10 KB — `public/css/style.css`
7. 22.18 KB — `public/workbox-f4f81699.js`
8. 12.52 KB — `public/privacy.html`
9. 5.64 KB — `public/js/dress-suggest.js`
10. 3.14 KB — `public/emoji/1f468-200d-1f4bc.svg`
11. 2.74 KB — `public/fallback-ce627215c0e4a9af.js`
12. 2.37 KB — `public/data-deletion.html`
13. 2.04 KB — `public/emoji/1f5d3.svg`
14. 1.88 KB — `public/emoji/1f4c5.svg`
15. 1.52 KB — `public/emoji/1f4e6.svg`
16. 1.46 KB — `public/emoji/1f3db.svg`
17. 1.40 KB — `public/inventory-photo-worker.js`
18. 1.05 KB — `public/emoji/1f4a1.svg`
19. 892 B — `public/emoji/1f4cb.svg`
20. 777 B — `public/manifest.json`
21. 639 B — `public/emoji/1f504.svg`
22. 591 B — `public/emoji/1f464.svg`
23. 591 B — `public/emoji/1f69a.svg`
24. 548 B — `public/emoji/26a0.svg`
25. 482 B — `public/emoji/2705.svg`
26. 423 B — `public/emoji/1f4ac.svg`
27. 391 B — `public/emoji/1f4de.svg`
28. 318 B — `public/emoji/1f512.svg`
29. 313 B — `public/worker-f97282c8b680443a.js`
30. 277 B — `public/emoji/1f4cd.svg`

