# Private media lifecycle — final report (Part 3)

Branch: `feature/private-media-lifecycle`  
Date: 2026-07-19

## Commit SHAs

| Part | SHA | Message |
|------|-----|---------|
| Part 1 | `f82f965` | feat(storage): separate permanent inventory from private booking media |
| Part 2 | `970cbd0` | feat(booking): delete private media after full return |
| Part 3 | *(latest on branch — message below)* | docs(release): private media lifecycle verification gate |

Prior hotfix on branch: `baaf53c` — ID proofs routed to private Blob token.

---

## Files changed (Parts 1–3 summary)

### Part 1 — Storage separation (`f82f965`)

| Area | Files |
|------|-------|
| Storage modules | `src/lib/storage/publicInventoryMedia.ts`, `privateBookingMedia.ts`, `privateMediaServe.ts`, `mediaClassification.test.ts` |
| Upload routing | `src/lib/upload.ts`, `order-photo/route.ts`, `return/[id]/save/route.ts`, `private-media/route.ts` |
| UI proxies | `photoUrl.ts`, `DeliveryDetailClient.tsx`, `ReturnDetailClient.tsx`, `BookingFormClient.tsx`, slips |
| Guards | `blobCleanup.ts` — `isPermanentInventoryMedia` refusal |
| Config/docs | `.env.example`, `verify-blob-config.mjs`, `private-media-lifecycle-audit.md` |

### Part 2 — Lifecycle + worker (`970cbd0`)

| Area | Files |
|------|-------|
| Schema | `prisma/schema.prisma`, migration `20260719200000_booking_private_media` |
| Tracking/cleanup | `bookingPrivateMediaTypes.ts`, `bookingPrivateMediaTracking.ts`, `bookingPrivateMediaCleanup.ts` |
| Integration | `operations.ts`, `bookingCrud.ts`, `jewelleryOps.ts`, `return/[id]/save/route.ts`, `cron/blob-cleanup/route.ts` |
| Backfill | `scripts/backfill-booking-private-media.ts` |
| Tests | `bookingPrivateMediaCleanup.test.ts`, expanded `idProofUpload.test.ts` |

### Part 3 — Release gate (`docs(release): …`)

| Area | Files |
|------|-------|
| Verify script | `scripts/verify-private-media-release.mjs` |
| Release test | `src/lib/storage/privateMediaRelease.test.ts` |
| Gate wiring | `package.json` (`verify:private-media-release`, `verify:release`) |
| Docs | `docs/release-verification-gate.md`, this report |
| Config | `.env.example` — full template + alias comment |
| Test fix | `bookingPrivateMediaCleanup.test.ts` — avoid `server-only` dynamic imports in unit tests |

---

## Prisma migration

**Name:** `20260719200000_booking_private_media`  
**Table:** `booking_private_media` — tracks temporary private booking blobs with status lifecycle (`ACTIVE` → `PENDING_DELETE` → `DELETED` / `DELETE_FAILED`).

Apply on staging/production only after review:

```bash
cd web
npx prisma migrate deploy
npm run backfill:booking-private-media   # optional: populate rows for existing bookings
```

---

## Storage classification

| Media | Token | Blob access | Path examples | Tracked in `booking_private_media` | Deleted after full return |
|-------|-------|-------------|---------------|-----------------------------------|---------------------------|
| Inventory dress photos | `BLOB_READ_WRITE_TOKEN` | public | `uploads/inventory/dresses/…`, legacy `originals/`, `thumbs/` | **No** | **Never** (permanent) |
| Inventory jewellery ref on booking | N/A (catalog URL) | public | Same as inventory | **No** | **Never** |
| ID proofs | `ID_PROOF_BLOB_READ_WRITE_TOKEN` (alias: `ID_PROOF_READ_WRITE_TOKEN`) | private | `uploads/private/id-proofs/…` | **Yes** | **Yes** |
| Order photos | private token | private | `uploads/private/orders/…` | **Yes** | **Yes** |
| Jewellery selection (manual) | private token | private | `uploads/private/jewellery-selections/…` | **Yes** | **Yes** |
| Incomplete return photos | private token | private | `uploads/private/incomplete-returns/…` | **Yes** | **Yes** |

Display: all private booking media served via authenticated proxy `/api/uploads/private-media?url=…` (or legacy `/api/uploads/id-proof?url=…` for ID proofs). Raw private blob URLs are not embedded in UI.

---

## Permanent vs temporary paths

**Permanent (`isPermanentInventoryMedia` → refuse delete without `allowInventoryReplacement`):**

- `uploads/inventory/**`
- Legacy: `originals/`, `thumbs/`, `recognition/`, 32-char hex filenames
- Public blob URLs pointing at the above

**Temporary private booking (`isPrivateBookingMedia` → tracked + cleaned):**

- `uploads/private/{id-proofs,jewellery-selections,orders,incomplete-returns,…}/`
- `.private.blob.vercel-storage.com` URLs for approved folders

---

## Cleanup trigger conditions

Private-media cleanup runs **only** when **all** are true:

1. Booking `status === "returned"`
2. Every active item delivered
3. Every delivered item returned (no partial return)
4. No incomplete-return flag on delivered items
5. Successful return transaction **committed** — `scheduleBookingPrivateMediaCleanup` called from **post-commit** side effects only

**Does not schedule cleanup:**

- Partial return
- Incomplete return (until resolved and fully returned)
- Failed return transaction
- Booking reopened from `returned` (pending rows reactivated to `ACTIVE`)

---

## Worker behaviour + retry

**Scheduler:** `scheduleBookingPrivateMediaCleanup` — idempotent `updateMany` on `ACTIVE` rows → `PENDING_DELETE`.

**Worker:** `processPendingPrivateMediaCleanup` (invoked from `/api/cron/blob-cleanup`):

1. Re-check full-return gate; if fail → revert row to `ACTIVE`
2. Refuse `isPermanentInventoryMedia` paths → `DELETE_FAILED` + `REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA`
3. Refuse non-private paths → `DELETE_FAILED` + `NOT_PRIVATE_BOOKING_MEDIA`
4. Delete blob via `deletePrivateBookingMedia` (private token)
5. Clear legacy URL fields **only on exact blob URL match**
6. On blob failure: retry up to **5** attempts with backoff `min(30, attempts) * 60s`; then `DELETE_FAILED`

Legacy `blob_cleanup_jobs` queue still runs separately; inventory paths are refused there too.

---

## Tests executed (actual results — 2026-07-19)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Unit | `npm run test:unit` | **PASS** — 416 tests, 0 failures |
| Integration | `npm run test:integration` | **PASS** — "Integration checks passed" |
| Lint | `npm run lint` | **PASS** (exit 0; pre-existing warnings only) |
| Blob config | `node scripts/verify-blob-config.mjs` | **PASS** (skipped locally; tokens not set) |
| Private media release | `node scripts/verify-private-media-release.mjs` | **PASS** — 77 critical tests, static checks OK |
| Next build | `npx next build` | **PASS** — compiled in ~34s |
| Full build | `npm run build` | **FAIL (Windows EPERM)** — `prisma generate` cannot rename `query_engine-windows.dll.node` when engine is locked after prior generate/build. **`npx next build` pass is acceptable** for local Windows gate. Vercel CI runs `prisma generate` in a clean environment. |

Critical unit subset (via `verify-private-media-release.mjs`):

- `mediaClassification.test.ts` — classification + token separation
- `bookingPrivateMediaCleanup.test.ts` — 18 lifecycle contracts + worker wiring
- `idProofUpload.test.ts` — ID proof upload + proxy contracts
- `privateMediaRelease.test.ts` — workflow simulation + worker runtime contracts

---

## Confirmation: inventory permanent / private deleted after full return

| Assertion | Mechanism |
|-----------|-----------|
| Inventory photos **never** deleted by private-media worker | `isPermanentInventoryMedia` guard in `processPendingPrivateMediaCleanup` and `processBlobCleanupJobs` |
| Inventory photos **never** tracked | `shouldTrackBookingPrivateMedia` returns false for permanent paths |
| Private booking photos **scheduled** on full return | `scheduleBookingPrivateMediaCleanup` post-commit in return save route |
| Private blobs **deleted** by worker | `deletePrivateBookingMedia` + row status `DELETED` |
| UI **does not** expose raw private URLs | `privateMediaUrl()` → authenticated proxy; static tests in release suite |

---

## Remaining risks

1. **Backfill incomplete** — existing bookings before migration may lack `booking_private_media` rows until backfill runs.
2. **Two cleanup systems** — legacy `blob_cleanup_jobs` and new `booking_private_media` worker; both refuse inventory deletes but operate on different triggers.
3. **Local dev without private token** — falls back to filesystem under `public/uploads/`; behaviour differs from Vercel private store.
4. **DELETE_FAILED rows** — require manual ops review if blob API persistently fails after 5 attempts.
5. **Signed URL mode** — `?format=signed` returns short-lived presigned URL to authenticated staff only; audit who uses this in clients.
6. **Windows EPERM** — `npm run build` may fail locally when Prisma engine DLL is locked; use fresh shell or `npx next build` after single `prisma generate`.

---

## Rollback instructions

1. **Revert commits** (newest first): Part 3 → Part 2 → Part 1 on branch, or deploy previous known-good SHA.
2. **Database:** migration adds table only — rollback deploy can leave table in place (harmless) or drop manually:
   ```sql
   DROP TABLE IF EXISTS booking_private_media;
   ```
3. **Env vars:** keep both tokens configured; Part 1+ requires private token for booking uploads. Rolling back code without rolling back env is safe.
4. **Blobs:** deleted private media cannot be restored from app — ensure backup/export before testing cleanup on production-like data.
5. **Redeploy** previous Vercel deployment from dashboard if git revert is not immediate.

---

## Git status (pre–Part 3 commit)

Part 3 touches docs, scripts, tests, and `package.json` only — `web/src` application logic unchanged from Part 2 except test file fix in `bookingPrivateMediaCleanup.test.ts`.

After Part 3 commit, working tree should be clean except audit output files (`audit-*-part3.txt`) which are not committed.

---

## Environment variables (`.env.example`)

```text
BLOB_READ_WRITE_TOKEN=                    # public inventory/catalogue
ID_PROOF_BLOB_READ_WRITE_TOKEN=           # private booking media
# ID_PROOF_READ_WRITE_TOKEN=              # legacy alias (same store)
```

Owner diagnostic: `GET /api/admin/blob-storage` → booleans only, never token values.
