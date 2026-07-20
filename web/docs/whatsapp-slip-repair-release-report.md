# WhatsApp Slip Repair & Release Report

**Branch:** `fix/whatsapp-premium-slip-validation`  
**Date:** 2026-07-20  
**Production deployment:** **STOPPED** — awaiting explicit approval after Preview verification.

---

## Root causes (Parts 1–3)

| Issue | Root cause | Fix |
|-------|------------|-----|
| Premium slip jobs failed with `PREMIUM_SLIP_RENDER_FAILED` | PDF marker validation searched compressed bytes via latin1; HTML sections not validated before render | HTML DOM validation before `page.pdf()`; binary-only PDF checks (`68d1e2e`) |
| Jobs showed “Meta accepted” without message ID | `sendStartedAt` set before PDF render completed | Provider fence only before Meta dispatch; render failures → `NOT_ATTEMPTED` |
| ETXTBSY / ENOSPC on Vercel | Shared `/tmp` exhaustion; concurrent Chromium extraction | Isolated temp paths, free-space preflight, launch retries, render queue (`952eac1`) |
| LRG-001 QR 404 in Scan Dress Availability | Print page encoded SKU without persisted scan mapping; scanner only looked up `inventoryScanCode` | Shared resolver with exact SKU fallback; print only registered codes; backfill script (`20c059f`) |

---

## Commit SHAs

| Commit | Description |
|--------|-------------|
| `68d1e2e` | Premium slip HTML validation + WhatsApp job state |
| `952eac1` | Chromium ETXTBSY / ENOSPC hardening |
| `20c059f` | Inventory scan resolution + print safety |
| *(pending)* | Safe render failure classification + owner bulk retry |

---

## Task 1 — Failed job classification

**Tooling**

- CLI: `npm run whatsapp:classify-failures` (add `--json` for full export)
- API: `GET /api/whatsapp/jobs/failure-report` (owner)

**Matching errors**

- `PREMIUM_SLIP_RENDER_FAILED`
- `PREMIUM_SLIP_VALIDATION_FAILED` / `PREMIUM_SLIP_HTML_VALIDATION_FAILED`
- `ETXTBSY`, `EBUSY`, `ENOSPC`

**Per-job fields**

| Field | Meaning |
|-------|---------|
| `metaCalled` | Meta dispatch started or message ID exists |
| `metaMessageId` | Confirmed wamid (payload or ledger) |
| `sendStartedAt` | Ledger fence timestamp (may be stale on render failures) |
| `sendConfirmedAt` | Provider accepted + stored ID |
| `failureBeforeProvider` | Render/infrastructure failure before confirmed send |
| `staleSendStartedAt` | Ledger has `sendStartedAt` but failure was pre-send render |
| `bucket` | `SAFE_RENDER_RETRY` or withhold reason |

**Local DB scan (dev):** 0 matching failed jobs.

---

## Task 2 — Safe requeue

**Owner action:** WhatsApp Job Queue → **Retry Safe Render Failures**

**API:** `POST /api/whatsapp/jobs/retry-safe-render-failures`  
Body: `{ "dryRun": false, "process": true }`

**Safe to requeue automatically**

- Render / validation / ETXTBSY / ENOSPC / EBUSY failure
- No Meta message ID
- No `sendConfirmedAt`
- Not `PROVIDER_OUTCOME_UNKNOWN`
- `safeRenderRetryCount < 1` (one owner-initiated retry per job)

**Never auto-requeue**

- Confirmed Meta message ID
- Provider outcome unknown
- Already received one safe render retry

**On requeue:** `attempts → 0`, `status → pending`, idempotency key preserved, `safeRenderRetryCount` incremented.

**Per-job Retry** also resets `attempts` when the failure is a render/infrastructure error.

---

## Task 3 — Controlled Preview test

**Script:** `npm run test:controlled-preview-slip`

Run against **Vercel Preview** (not production) with:

- `DATABASE_URL` → Preview database
- Meta WhatsApp credentials + `WHATSAPP_TEST_PHONE` on approved test list
- `NEXT_PUBLIC_APP_URL` → Preview URL

**Steps automated**

1. Create synthetic booking with LRG-001 dress
2. Premium booking slip → WhatsApp
3. Deliver booking → premium delivery slip
4. Resolve QR `LRG-001` + availability check (HTTP 200, not 404)
5. Resolve Code 128 barcode for same dress
6. Partial/incomplete return → incomplete slip

**Manual verification on Preview**

- [ ] Open each WhatsApp PDF — premium design, no simplified fallback
- [ ] Confirm `data-slip-section` markers present (no validation failure)
- [ ] Exactly one WhatsApp message per slip action
- [ ] Job queue shows `done` + Meta message ID per slip
- [ ] Scan LRG-001 in Scan Dress Availability UI
- [ ] Scan Code 128 in same session (camera not QR-only)

**PDF screenshots:** Capture from test phone after Preview run (not attached — requires live Preview execution).

---

## Task 4 — Release process

### Completed

- [x] Parts 1–3 implemented and unit-tested locally
- [x] `typecheck`, `test:unit`, `test:integration`, `lint`, `build`, `test:e2e` passed (prior QR commit)
- [x] Classification + safe retry tooling added
- [x] Local classification: 0 jobs to requeue

### Not done (awaiting your go-ahead)

- [ ] Push branch → Vercel Preview deploy
- [ ] Run `npm run test:controlled-preview-slip` against Preview DB
- [ ] Visual PDF review on test phone
- [ ] Run `npm run backfill:inventory-scan-codes -- --dry-run` on Preview DB
- [ ] Run `npm run backfill:inventory-scan-codes -- --apply` if dry-run clean
- [ ] Merge approved commits to main
- [ ] Production deploy
- [ ] **Retry Safe Render Failures** on production failed jobs only after Preview success

**Deployment ID:** Not assigned — production deploy intentionally skipped.

---

## Files changed (Task 1–2, this session)

| File | Change |
|------|--------|
| `src/lib/services/whatsapp/whatsappJobClassification.ts` | Job failure classifier + report |
| `src/lib/services/whatsapp/whatsappProviderOutcome.ts` | Infrastructure failure detection, safe requeue gates |
| `src/lib/services/whatsapp/jobQueue.ts` | Bulk safe retry, export report |
| `src/app/api/whatsapp/jobs/failure-report/route.ts` | Owner classification API |
| `src/app/api/whatsapp/jobs/retry-safe-render-failures/route.ts` | Owner bulk retry API |
| `src/app/api/whatsapp/jobs/[id]/retry/route.ts` | Reset attempts on render retry |
| `src/components/whatsapp/WhatsAppJobsClient.tsx` | “Retry Safe Render Failures” button |
| `scripts/classify-failed-whatsapp-jobs.ts` | CLI classifier |
| `scripts/controlled-preview-slip-test.ts` | End-to-end Preview test harness |

---

## Migration / backfill

| Script | Status |
|--------|--------|
| `npm run backfill:inventory-scan-codes -- --dry-run` | Ready — run on Preview before apply |
| `npm run backfill:inventory-scan-codes -- --apply` | Not run locally |

---

## QR / Code 128 (LRG-001)

- Resolver order: active scan code → exact unique SKU → `CODE_NOT_FOUND`
- Scan availability returns HTTP **200** for not-linked codes (structured card, not 404)
- Unit + e2e tests cover LRG-001 fixture

---

## Test results (local)

| Suite | Result |
|-------|--------|
| `whatsappJobClassification.test.ts` | 7/7 pass |
| `whatsappProviderOutcome.test.ts` | 10/10 pass |
| `typecheck` | pass |
| `whatsapp:classify-failures` | 0 jobs in local DB |
