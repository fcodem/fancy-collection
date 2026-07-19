# Final Performance Release Gate

Generated: 2026-07-19 (local integration branch `test/final-performance-release`)

Integration HEAD: `cbdfa28` (`test/final-performance-release`)

## Branch SHAs (Parts 1–8)

| Part | Branch | Tip SHA | Notes |
|------|--------|---------|-------|
| 1 | `feature/dashboard-dress-scan-access` | `53a441f` | Dashboard dress scanner access + large integration bundle |
| 2 | `fix/dashboard-read-transactions` | `8089333` | Bounded dashboard read semaphore |
| 3 | `perf/booking-date-check-fast` | `ec60e09` | Single indexed date-check query |
| 4 | `perf/monthly-booking-counter` | `45cce42` | Atomic monthly serial counter |
| 5 | `perf/available-items-consistent-fast` | `7a2f11a` | Availability API cache/coalesce (`44433ea` base) |
| 6 | `perf/shared-read-auth-cache` | `9123dbf` | 3-layer read auth cache (committed this session) |
| 7 | `fix/ai-native-worker-crash` | `5700757` | AI worker isolation (`8e533a1` + test fix) |
| 8 | `perf/booking-save-final-verification` | `6bb7e5f` | Instrumented atomic booking create (committed this session) |

Base: `origin/main` @ `87dd2e8`

## Integration branch

- Branch: `test/final-performance-release`
- Built by fast-forward/merging Parts 1–8 locally (no push to production)
- Merge commits: Part 2 `cb4c750` … Part 8 `fd03182`, plus gate fixes

## What was ported vs newly written

| Part | Ported from existing work | New this session |
|------|---------------------------|------------------|
| 6 | `sharedReadSessionCache.ts`, session cache, auth, migration from `feature/dashboard-dress-scan-access` | Dedicated branch commit `9123dbf`; `date-check` → `requireFastReadUser`; schema `revision`/`expiresAt` |
| 7 | Commits `8e533a1`, `5700757` already complete | Verification only; all 35 targeted unit tests pass |
| 8 | `bookingCreateFast.ts`, orchestration, tests from feature branch | Dedicated branch commit `6bb7e5f` |
| 9 | Prior integration on old `test/final-performance-release` (`423e147`, `66a69f5`) superseded | Rebuilt integration branch; gate doc; typecheck/chromium test fixes |

## `npm run verify:release` results (integration branch)

| Stage | Status | Details |
|-------|--------|---------|
| `typecheck` | **PASS** | After adding scan-availability perf stages + `getDurableWorkerHealth` import |
| `test:unit` | **PASS** | 399 tests, 0 failures |
| `test:integration` | **FAIL** | `booking_serial_counter` relation missing — local DB migrations not applied (`42P01`) |
| `lint` | Not reached | Blocked by integration failure |
| `build` | Not reached | |
| `test:e2e` | Not reached | |
| `perf:smoke` | Not reached | |

### Gate status: **FAIL** (integration DB prerequisite)

Release must fail until integration DB has migrations through `20260719200000_booking_serial_counter` (and session revision migration). Apply with `npx prisma migrate deploy` against a test database, then re-run `npm run verify:release`.

### Failure conditions checked (static / unit)

- P2028 / P2024: dashboard read tests cover stale fallback and timeout without retry storm
- AI crash in normal routes: `aiWorkerIsolation.test.ts` passes (7 routes scanned)
- Auth invalidation: `sharedReadSessionCache.test.ts` force-logout + role/deactivation tests pass
- Serial duplicates: `bookingSerialCounter.test.ts` + atomic create SQL in `bookingCreateFast.ts`
- Scanner / dashboard shortcut: `dressScanSession.test.ts`, e2e spec present (e2e not run)

## Vercel Preview

**Not attempted.** Push to a preview branch was not performed (per constraint: no production deploy, no push unless required for preview). Local tree is clean except untracked `.wt-dress-scan-part1/`. Preview would require `git push -u origin test/final-performance-release` with user credentials.

## Gaps / limitations

1. **Prisma generate EPERM** on Windows when query engine DLL is locked — run with dev server stopped before release verify.
2. **Integration / e2e / build / perf:smoke** not fully executed in this gate run due to missing local migration.
3. **Part 1 feature branch** already contained overlapping Parts 4–8 work; dedicated Part 6/8 branches add schema fixes and `date-check` fast-auth wiring.
4. **Branch switching**: multiple perf branches exist; integration branch is the canonical local combine point.

## Recommended next steps

```powershell
cd C:\Projects\ssdn-soft\web
npx prisma migrate deploy
npm run verify:release
```

Do not merge to production until integration, build, e2e, and perf:smoke all pass on CI or a migrated staging database.
