# Server bundle trace report — baseline

Generated: 2026-07-19T10:35:02.960Z

## Metrics

- Function traces: 297 (202 API, 95 pages)
- Largest function: app/api/cron/ai-job-worker (431.08 MB)
- Unique traced server files: 579.18 MB
- Next output: 922.89 MB
- Build cache: 878.04 MB
- Public assets: 226.40 MB
- Build duration: not measured

## Heavy package routes

- Chromium/Puppeteer (1): app/api/internal/slip/render
- AI native (31): app/api/admin/ai/enhancement/reset-all, app/api/admin/ai/enhancement/retry, app/api/admin/ai/settings, app/api/admin/ai-debug, app/api/admin/ai-health, app/api/admin/ai-indexing, app/api/admin/dress-checker/confirm-same-dress, app/api/admin/dress-checker/corrections/export, app/api/admin/dress-checker/feedback, app/api/admin/dress-checker/lifecycle, app/api/admin/dress-checker-debug, app/api/admin/index-dress-photos, app/api/admin/inventory-ai-profile/[id]/refresh-embeddings, app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints, app/api/admin/inventory-ai-profile/[id]/refresh-metadata, app/api/admin/inventory-ai-profile/[id]/regenerate, app/api/admin/recognition/compare, app/api/admin/recognition/queue, app/api/admin/recognition/rebuild, app/api/admin/recognition/retry-failed, app/api/admin/recognition/search-diagnostics, app/api/cron/ai-job-worker, app/api/cron/ai-queue-watchdog, app/api/cron/dress-checker-repair, app/api/dress-checker/correction, app/api/health, app/api/inventory/duplicate-check, app/api/inventory/photo-search, app/api/inventory, app/api/inventory/[id], instrumentation
- Sharp/native image (64): ../next-server, app/api/admin/ai/enhancement/reset-all, app/api/admin/ai/enhancement/retry, app/api/admin/ai/settings, app/api/admin/ai-debug, app/api/admin/ai-health, app/api/admin/ai-indexing/forensic, app/api/admin/ai-indexing, app/api/admin/dress-checker/confirm-same-dress, app/api/admin/dress-checker/corrections/export, app/api/admin/dress-checker/feedback, app/api/admin/dress-checker/lifecycle, app/api/admin/dress-checker-debug, app/api/admin/image-sync, app/api/admin/index-dress-photos, app/api/admin/inventory-ai-profile/[id]/refresh-embeddings, app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints, app/api/admin/inventory-ai-profile/[id]/refresh-metadata, app/api/admin/inventory-ai-profile/[id]/regenerate, app/api/admin/recognition/compare, app/api/admin/recognition/diagnostics, app/api/admin/recognition/queue, app/api/admin/recognition/rebuild, app/api/admin/recognition/retry-failed, app/api/admin/recognition/search-diagnostics, app/api/admin/recognition/[id]/fingerprint, app/api/admin/test-all-slips, app/api/ai-tools/catalog-generator, app/api/ai-tools/catalog-generator/save, app/api/ai-tools/image-enhancer/preview, app/api/ai-tools/image-enhancer/save, app/api/booking/date-check, app/api/booking/[id]/cancel, app/api/booking/[id]/items/[itemId]/cancel, app/api/booking/[id], app/api/booking-delivery/[id]/id-photos, app/api/booking-delivery/[id]/save, app/api/cron/ai-job-worker, app/api/cron/ai-queue-watchdog, app/api/cron/blob-cleanup, app/api/cron/dress-checker-repair, app/api/dashboard/free-items, app/api/dress-checker/correction, app/api/health, app/api/incomplete-return/[id]/resolve, app/api/inventory/duplicate-check, app/api/inventory/photo-search, app/api/inventory, app/api/inventory/[id], app/api/jewellery-selection/[id]/add, app/api/jewellery-selection/[id]/available, app/api/jewellery-selection/[id]/photo, app/api/jewellery-selection/[id]/remove, app/api/packing-list/save-item, app/api/recycle-bin, app/api/recycle-bin/[id]/restore, app/api/recycle-bin/[id]/restore-check, app/api/recycle-bin/[id], app/api/return/[id]/save, app/api/returning-today, app/api/uploads/order-photo, app/booking-delivery/[id], app/jewellery-selection/[id], instrumentation
- PDF packages (1): app/api/internal/slip/render

## Top 30 largest traced deployment files

1. 61.79 MB — `node_modules/@sparticuz/chromium/bin/chromium.br`
2. 20.20 MB — `node_modules/.prisma/client/query_engine-windows.dll.node`
3. 20.20 MB — `node_modules/.prisma/client/query_engine-windows.dll.node.tmp23584`
4. 18.23 MB — `node_modules/next/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`
5. 18.20 MB — `node_modules/@xenova/transformers/node_modules/sharp/build/Release/libvips-42.dll`
6. 18.20 MB — `node_modules/@xenova/transformers/node_modules/sharp/vendor/8.14.5/win32-x64/lib/libvips-42.dll`
7. 18.08 MB — `node_modules/@img/sharp-win32-x64/lib/libvips-42.dll`
8. 16.73 MB — `node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node`
9. 8.87 MB — `node_modules/onnxruntime-node/bin/napi-v3/win32/arm64/onnxruntime.dll`
10. 8.84 MB — `node_modules/onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime.dll`
11. 8.69 MB — `node_modules/typescript/lib/typescript.js`
12. 7.10 MB — `public/booking-bills/BK-015337.pdf`
13. 6.11 MB — `public/uploads/booking-bills/BK-015356.pdf`
14. 5.47 MB — `public/uploads/studio/1041-transparent.png`
15. 5.09 MB — `public/uploads/booking-bills/BK-015363.pdf`
16. 5.03 MB — `public/uploads/booking-bills/BK-015357.pdf`
17. 4.76 MB — `public/uploads/booking-bills/BK-015359.pdf`
18. 4.67 MB — `public/uploads/originals/182d98e833234322af1864c0bba308d1.jpg`
19. 4.67 MB — `public/uploads/originals/a524c80933f4438f899656fc4b321a78.jpg`
20. 4.61 MB — `public/uploads/originals/75b560e406e04503b07ec4a694b0c1c5.jpg`
21. 4.34 MB — `public/uploads/originals/9ab2e7c693bc4c378f5e49edfd625eba.jpg`
22. 4.33 MB — `public/uploads/booking-bills/BK-015358.pdf`
23. 4.33 MB — `public/uploads/booking-bills/BK-015361.pdf`
24. 4.32 MB — `public/uploads/booking-bills/BK-015360.pdf`
25. 3.97 MB — `public/uploads/dress-checker-corrections/0f8b5be2105e4cb5bb6c962494e2bfeb.jpg`
26. 3.97 MB — `public/uploads/dress-checker-corrections/23fcbf348fe849c193776b414220674b.jpg`
27. 3.97 MB — `public/uploads/dress-checker-corrections/3596d5d6e26a486f8be1c87e65e1350d.jpg`
28. 3.97 MB — `public/uploads/dress-checker-corrections/d750c1b3765c48829e7ebfe134fdf78d.jpg`
29. 3.92 MB — `public/uploads/dress-checker-corrections/03e86cc5817a443f8f88e95c9bab9198.jpg`
30. 3.92 MB — `public/uploads/dress-checker-corrections/0b4a290c0e664fe3b23f498cf5ae67c5.jpg`

## Top 30 largest function traces

1. 431.08 MB (599 files) — `app/api/cron/ai-job-worker`
2. 431.08 MB (599 files) — `app/api/cron/ai-queue-watchdog`
3. 431.07 MB (599 files) — `app/api/cron/dress-checker-repair`
4. 430.22 MB (599 files) — `app/api/inventory`
5. 430.22 MB (599 files) — `app/api/inventory/[id]`
6. 430.21 MB (598 files) — `app/api/inventory/photo-search`
7. 430.21 MB (598 files) — `app/api/admin/recognition/search-diagnostics`
8. 430.13 MB (584 files) — `app/api/admin/ai-health`
9. 430.12 MB (584 files) — `app/api/admin/ai/settings`
10. 430.12 MB (584 files) — `app/api/admin/recognition/rebuild`
11. 430.12 MB (584 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-fingerprints`
12. 430.12 MB (584 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-embeddings`
13. 430.12 MB (584 files) — `app/api/admin/ai/enhancement/reset-all`
14. 430.12 MB (584 files) — `app/api/admin/inventory-ai-profile/[id]/refresh-metadata`
15. 430.12 MB (584 files) — `app/api/admin/inventory-ai-profile/[id]/regenerate`
16. 430.12 MB (584 files) — `app/api/admin/ai/enhancement/retry`
17. 430.12 MB (584 files) — `app/api/admin/recognition/retry-failed`
18. 430.12 MB (584 files) — `app/api/admin/recognition/queue`
19. 429.79 MB (585 files) — `app/api/admin/ai-debug`
20. 429.79 MB (585 files) — `app/api/admin/dress-checker-debug`
21. 429.77 MB (583 files) — `app/api/admin/ai-indexing`
22. 429.75 MB (580 files) — `app/api/health`
23. 429.74 MB (579 files) — `app/api/dress-checker/correction`
24. 429.74 MB (579 files) — `app/api/admin/dress-checker/corrections/export`
25. 429.74 MB (577 files) — `app/api/admin/dress-checker/lifecycle`
26. 429.74 MB (577 files) — `app/api/admin/index-dress-photos`
27. 429.73 MB (576 files) — `app/api/inventory/duplicate-check`
28. 429.70 MB (577 files) — `app/api/admin/dress-checker/feedback`
29. 429.70 MB (577 files) — `app/api/admin/dress-checker/confirm-same-dress`
30. 386.42 MB (554 files) — `app/api/booking/[id]`

## Largest public files

1. 7.10 MB — `public/booking-bills/BK-015337.pdf`
2. 6.11 MB — `public/uploads/booking-bills/BK-015356.pdf`
3. 5.47 MB — `public/uploads/studio/1041-transparent.png`
4. 5.09 MB — `public/uploads/booking-bills/BK-015363.pdf`
5. 5.03 MB — `public/uploads/booking-bills/BK-015357.pdf`
6. 4.76 MB — `public/uploads/booking-bills/BK-015359.pdf`
7. 4.67 MB — `public/uploads/originals/182d98e833234322af1864c0bba308d1.jpg`
8. 4.67 MB — `public/uploads/originals/a524c80933f4438f899656fc4b321a78.jpg`
9. 4.61 MB — `public/uploads/originals/75b560e406e04503b07ec4a694b0c1c5.jpg`
10. 4.34 MB — `public/uploads/originals/9ab2e7c693bc4c378f5e49edfd625eba.jpg`
11. 4.33 MB — `public/uploads/booking-bills/BK-015358.pdf`
12. 4.33 MB — `public/uploads/booking-bills/BK-015361.pdf`
13. 4.32 MB — `public/uploads/booking-bills/BK-015360.pdf`
14. 3.97 MB — `public/uploads/dress-checker-corrections/0f8b5be2105e4cb5bb6c962494e2bfeb.jpg`
15. 3.97 MB — `public/uploads/dress-checker-corrections/23fcbf348fe849c193776b414220674b.jpg`
16. 3.97 MB — `public/uploads/dress-checker-corrections/3596d5d6e26a486f8be1c87e65e1350d.jpg`
17. 3.97 MB — `public/uploads/dress-checker-corrections/d750c1b3765c48829e7ebfe134fdf78d.jpg`
18. 3.92 MB — `public/uploads/dress-checker-corrections/03e86cc5817a443f8f88e95c9bab9198.jpg`
19. 3.92 MB — `public/uploads/dress-checker-corrections/0b4a290c0e664fe3b23f498cf5ae67c5.jpg`
20. 3.92 MB — `public/uploads/dress-checker-corrections/3bb8ffa1de724e20bb117e5f64ab384c.jpg`
21. 3.92 MB — `public/uploads/dress-checker-corrections/435e21e50f3c4c79b4ea948631111e46.jpg`
22. 3.92 MB — `public/uploads/dress-checker-corrections/562e3cb89aaf44619fbac0d9a81d85d4.jpg`
23. 3.92 MB — `public/uploads/dress-checker-corrections/7ac2ea4289a44e8ea06d1122909a1220.jpg`
24. 3.92 MB — `public/uploads/dress-checker-corrections/a2a15336fe0642f38683fcaa3c24872c.jpg`
25. 3.92 MB — `public/uploads/dress-checker-corrections/a4acf8b54f064e818770d29ee99ddda1.jpg`
26. 3.92 MB — `public/uploads/dress-checker-corrections/dbc04693ef7144ffa78b95454f99669a.jpg`
27. 3.92 MB — `public/uploads/dress-checker-corrections/e4f20958986e485cbb28e99a5db35919.jpg`
28. 3.92 MB — `public/uploads/dress-checker-corrections/f427052fd1a04ad4ac7b6489252f81a0.jpg`
29. 3.90 MB — `public/uploads/originals/240ec5f73c4b4d548ae539704ad7ea72.jpg`
30. 3.77 MB — `public/uploads/studio/1036-transparent.png`

