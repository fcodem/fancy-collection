# Prisma pool stability (Prompt 10)

Branch: `perf/prisma-pool-stability`

## Problem

Production showed `Timed out fetching a new connection` (`P2024`) with
`connection_limit = 3`, `pool timeout = 15s`. Goal: keep 5–10 simultaneous
staff users healthy **without first raising the connection limit**.

## What changed

- **Instrumentation** — `src/lib/prismaConcurrency.ts` is a per-instance gauge
  wired into the Prisma singleton via query middleware (`src/lib/prisma.ts`).
  It records in-flight and high-water concurrent query counts. Registration is
  guarded (`typeof $use === "function"`) so it is a no-op if the API is absent,
  and it only measures — it never blocks a query, so it cannot deadlock
  interactive transactions.
- **Perf field** — `maxConcurrentQueries` added to `PerfTimings` and logged by
  every instrumented route (`src/lib/perfTiming.ts`). Combined with existing
  `queryCount`, `transactionMs`, `dbWaitMs`, `queryMs`, `totalMs`.
- **Bounded fan-out helper** — `src/lib/concurrency.ts` (`allLimit`, `mapLimit`)
  caps how many independent queries run at once. Applied to the unbounded
  `itemIds × 2` learning fan-out in `positivePairLearning.ts`.
- **Load test** — `scripts/load-test.mjs` fires the required concurrent staff
  scenarios against a staging/preview URL and fails on any pool timeout, 5xx,
  or >5s request.

## Audit findings (static)

The hot staff paths are already single-query or single-CTE and coalesced, which
is why the fix is measurement + bounded fan-out rather than raising the limit:

| Path | Shape | Coalesced |
|------|-------|-----------|
| Dashboard essential/business/finance/AI-health | one aggregate/CTE query each | `cachedQuery` + `memoryCachedQuery` |
| Dashboard secondary lists | one timed read transaction each (`SET LOCAL statement_timeout`) | cached |
| Navigation counts | one `booking.count` | cached |
| Categories | one `UNION ALL` raw query | `staleValueCache` (coalesced, stale-on-error) |
| Delivery/Return search | one `findMany` per indexed mode (sequential fallback) | client dedupe |
| Availability | one large CTE raw query | client dedupe |
| Packing list | one query + optional warning query (sequential) | — |
| Inventory list | one aggregate CTE (exact-SKU adds one sequential) | client dedupe |
| QR resolver | one `findUnique` | coalesced + 30s hash cache |
| Session validation | one `userSession.findFirst` on miss | coalesced |

Remaining large `Promise.all` groups are analytics/admin/backup paths
(`execBriefing` 12, `finance` 7, `backupData` 14, `pgvector` 8). These are
cache-guarded and not on the 5–10 concurrent-staff hot path; the helper is
available to bound them if load testing shows pressure.

## Prisma lifecycle (confirmed)

- One global client per runtime instance (`globalForPrisma.prisma`).
- No client constructed inside route handlers.
- No `$disconnect()` per request.
- AI/native worker runs on cron/worker paths, not shared with request auth.

## Cache-stampede protection (confirmed)

Request coalescing already exists for categories (`staleValueCache`), dashboard
stats and nav counts (`memoryCachedQuery`), session validation and QR resolver
(explicit `pending` maps), availability and packing (client dedupe). One expired
key triggers one refresh, not many.

## Staging load test (to run — not run in this environment)

No staging DB is available here. Run against a preview deploy:

```bash
BASE_URL="https://<preview>.vercel.app" COOKIE="fc_session=..." node scripts/load-test.mjs
```

Scenarios: 5 dashboards, 10 nav-counts, 10 delivery, 10 return, 10 availability,
5 inventory. Acceptance: no `P2024`, no pool timeout, no request > 5s.

## Connection-limit experiment (to run — not run here)

Only **after** confirming query reduction, compare on staging:

- `connection_limit=3` (current)
- `connection_limit=5`

Record P2024 count, p95, and pooler connection count for each. Do not change
production automatically. Current default remains `3` (see `normalizeDatabaseUrl`).
