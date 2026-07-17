# Performance: region latency and connection pool

## Current configuration (as of 2026-07)

| Layer | Region / setting |
| --- | --- |
| Vercel Functions (`fcmanage`) | `bom1` (Mumbai) |
| Supabase PostgreSQL | Distant from `bom1` (cross-region round trips) |
| Prisma | Uses `DATABASE_URL` (transaction pooler) + `DIRECT_URL` for migrations |
| Concurrent staff users | Approximately 5–10 |

Do **not** move the production database or change production Vercel region without explicit owner approval.

## Latency impact

Each Prisma round trip across regions typically costs tens of milliseconds. Nested loops (`findMany` then per-row `findUnique`) amplify this. Prefer:

- Narrow selects
- Batched `updateMany` / `createMany`
- One interactive transaction with row locks instead of many short queries
- Bounded `Promise.all` fan-out (avoid exhausting the pool)

## Pool recommendations (5–10 users)

| Setting | Recommendation |
| --- | --- |
| Prisma `connection_limit` on pooler URL | 5–10 per serverless instance (keep low; many instances share Supabase pooler) |
| Parallel queries per request | Prefer ≤ 4–6 concurrent DB calls |
| Interactive transaction timeout | Keep under function `maxDuration` with headroom |
| Watch for | Prisma `P2024` (pool timeout) under concurrent navigation |

Example URL params (do not commit secrets):

```text
?pgbouncer=true&connection_limit=5&pool_timeout=20
```

## Safe preview-region experiment

1. Create a **Preview** deployment with `VERCEL_REGION` / project region override if available, or a separate Vercel project pointed at the same Preview DB.
2. Measure p50/p95 for:
   - `POST /api/booking`
   - `GET /api/booking/available-items`
   - dashboard summary
3. Compare against `bom1` production timings (same query shapes).
4. Do **not** flip production region from this experiment alone.

## Measured latency

Fill in after a safe staging/preview run (never against production write load for stress tests):

| Probe | Cold | Warm |
| --- | --- | --- |
| Simple `SELECT 1` via Prisma | _TBD_ | _TBD_ |
| Availability query | _TBD_ | _TBD_ |
| Dashboard summary | _TBD_ | _TBD_ |

## Supabase migration risks

Moving the primary database to Mumbai (or closer) can reduce RTT substantially but risks include:

- Replication lag / cutover downtime
- DNS and connection string updates across Vercel envs
- Migration of storage / auth if co-located products are used
- Need for dual-write or freeze window

Treat as a separate approved project, not part of this correctness/speed PR.

## Rollback

1. Revert application deploy to previous Vercel deployment.
2. Leave database region unchanged unless a dedicated DB migration runbook was followed.
3. Pool URL parameter changes can be reverted by restoring prior `DATABASE_URL` query string in Vercel env (no schema change required).
