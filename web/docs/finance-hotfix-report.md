# Finance Hotfix Report

**Branch:** `fix/finance-navigation-and-rendering`  
**Base:** `main` @ `87dd2e8`  
**Date:** 2026-07-20

## Root causes

1. **Missing `/finance` index route** — Navigating to `/finance` returned 404 because only child routes (e.g. `/finance/ledger`) existed.
2. **Prefetch storm** — Next.js `<Link>` defaults prefetch all visible finance sidebar links on owner pages, causing simultaneous RSC/API requests for every finance report.
3. **Chart.js blocked by CSP** — `FinanceChart` loaded Chart.js from `cdn.jsdelivr.net` via `next/script`, which violates the app CSP (`script-src 'self'`).
4. **Runtime crashes on malformed payloads** — Components called `Object.keys()` on nullable category maps from API responses, throwing and triggering the global error boundary (“Something went wrong”).
5. **No finance-scoped error isolation** — Chart/render failures bubbled to the root error UI instead of a recoverable finance boundary.
6. **PWA stale chunks** — Service worker cached static assets but finance HTML/API needed explicit network-only rules; stale chunks could cause `ChunkLoadError` without recovery.

## Files changed

| Area | Files |
|------|-------|
| Redirect | `web/src/app/finance/page.tsx` |
| Prefetch | `web/src/components/AppShell.tsx` |
| Charts | `web/src/components/finance/FinanceChart.tsx`, `FinanceChartSection.tsx` |
| Runtime safety | `web/src/lib/finance/safeNumbers.ts`, `FinanceCategorySaleTable.tsx`, `FinancePages.tsx`, `FinanceDailySale.tsx`, `FinanceLedger.tsx` |
| Error isolation | `web/src/app/finance/error.tsx` |
| PWA / chunks | `web/src/lib/pwaRuntimeCaching.ts`, `web/src/lib/chunkLoadRecovery.ts`, `web/src/components/ClientProviders.tsx` |
| API reliability | `web/src/lib/finance/financeApiRoute.ts`, all `web/src/app/api/finance/**/route.ts` GET handlers |
| Tests | `web/src/lib/finance/safeNumbers.test.ts`, `financeHotfixContracts.test.ts`, `web/e2e/finance-navigation.spec.ts` |
| Tooling | `web/package.json` (unit test list) |

## Routes verified

| Route | Status |
|-------|--------|
| `/finance` → `/finance/ledger` | Redirect added |
| `/finance/ledger` | Page exists, chart wrapped |
| `/finance/daily-sale` | Page exists, safe maps + chart |
| `/finance/daily-booking` | Page exists |
| `/finance/monthly-sale` | Page exists |
| `/finance/yearly-sale` | Page exists |
| `/finance/top-performer` | Page exists |
| `/finance/inventory-profitability` | Page exists |
| `/finance/category-analysis` | Page exists |
| `/finance/security-deposit` | Page exists |
| `/finance/suppliers` | Page exists |

## Verification results

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | Pass (src) | Pre-existing stale `.next/types` references to removed routes fail outside `src/` |
| `npm run test:unit` | **365 pass / 0 fail** | Includes new finance contract + safeNumbers tests |
| `npm run test:integration` | **Pass** | |
| `npm run lint` | **Pass** | Pre-existing warnings only |
| `npm run build` | **Pass** via `next build` | Full `npm run build` hit Windows EPERM on `prisma generate` file rename |
| `npm run test:e2e` | **120 skipped** | Requires `E2E_STORAGE_STATE` owner session |
| `rg cdn.jsdelivr.net` (finance) | **0 matches** | |
| `rg window.Chart` (finance) | **0 matches** | |
| `prefetch={false}` on NAV_FINANCE | **Confirmed** | Single sidebar map, no duplicate mobile menu |

## Git status at report time

Committed on branch `fix/finance-navigation-and-rendering`. Untracked audit output files under `web/audit-*.txt` were intentionally excluded.

## Commit

```
fix(finance): resolve navigation, CSP chart loading, and runtime safety
```

**Commit SHA:** `c347fc3`
