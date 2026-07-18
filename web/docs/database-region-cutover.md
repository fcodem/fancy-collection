# Nearby-database migration plan (Prompt 13, Part A)

Branch: `docs/staging-and-database-cutover` — **planning only, do not change production.**

## Problem

- Vercel functions run in **Mumbai (`bom1`)**.
- The Supabase Postgres pooler is in **Sydney (`ap-southeast-2`)**.
- Every remaining DB round-trip pays ~110–160 ms Mumbai↔Sydney RTT. With several
  queries per request this dominates warm latency even after query reduction.

## Goal

Move Postgres to a region close to `bom1` to cut per-query RTT to single digits,
with a reversible, verified cutover and minimal downtime.

## 1. Available nearby regions

| Provider | Region | Approx RTT from `bom1` |
|----------|--------|------------------------|
| Supabase | **Mumbai (`ap-south-1`)** | ~2–8 ms (best) |
| Supabase | Singapore (`ap-southeast-1`) | ~35–60 ms |
| AWS RDS/Aurora | Mumbai (`ap-south-1`) | ~2–8 ms |
| Neon | Singapore | ~35–60 ms |

Preferred target: **Supabase project in `ap-south-1` (Mumbai)** — keeps the same
provider (pgvector, pooler, auth, Blob independence) and collapses latency.

## 2. Current vs expected timings

| Metric | Now (Sydney) | Expected (Mumbai) |
|--------|--------------|-------------------|
| Single query RTT | ~110–160 ms | ~2–8 ms |
| QR resolver DB | ~600–760 ms | <100 ms |
| Dashboard essential | ~400–900 ms warm | <200 ms warm |
| Availability | ~3.7 s cold observed | well under target |

Capture real before/after with `npm run perf:smoke` against each region.

## 3. Backup procedure (before anything)

1. Supabase Dashboard → Database → Backups: trigger an on-demand backup; note the
   restore point.
2. Logical dump of the source:
   ```bash
   pg_dump --no-owner --no-privileges --format=custom \
     --dbname="$SOURCE_DIRECT_URL" --file=fc_pre_migration.dump
   ```
3. Store the dump off-box (not in Git). Record `pg_dump`/`pg_restore` versions.

## 4. Schema-only migration (new project)

1. Create the new Supabase project in `ap-south-1`.
2. Enable extensions used by the app: `pgvector` (`create extension if not exists vector;`),
   plus any others (`pgcrypto` for `gen_random_uuid()`).
3. Apply schema with Prisma (authoritative source of truth):
   ```bash
   DATABASE_URL="$NEW_DIRECT_URL" DIRECT_URL="$NEW_DIRECT_URL" npx prisma migrate deploy
   ```

## 5. Data-copy method

Restore the dump data into the new schema (data only, keep Prisma-managed schema):
```bash
pg_restore --no-owner --no-privileges --data-only --disable-triggers \
  --dbname="$NEW_DIRECT_URL" fc_pre_migration.dump
```
For large `pgvector` columns verify the `vector` extension exists first, else the
restore of embedding columns fails.

## 6. Verification (run on the NEW db before cutover)

- **Row counts** per table match source:
  ```sql
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
  ```
  Compare against the same query on source (or `SELECT count(*)` per table).
- **Sequences** advanced past max id:
  ```sql
  SELECT sequencename, last_value FROM pg_sequences;
  ```
  Fix any lagging sequence: `SELECT setval('bookings_id_seq', (SELECT max(id) FROM bookings));`
- **Foreign keys** valid: `SET session_replication_role = default;` then spot-check
  joins; run `SELECT conname FROM pg_constraint WHERE contype='f';` and validate.
- **pgvector**: `SELECT count(*) FROM inventory_ai_profiles WHERE embedding_vector IS NOT NULL;`
  and a sample similarity query returns results.
- **App-level**: run `npm run test:integration` pointed at the new DIRECT_URL.

## 7. Connection pooler setup

- Use the new project's **transaction pooler** URL (port 6543, `pgbouncer=true`)
  as `DATABASE_URL`; the direct (5432) URL as `DIRECT_URL` for migrations.
- Keep the app's `normalizeDatabaseUrl` defaults: `connection_limit=3`,
  `pool_timeout=15`, `connect_timeout=10`, `sslmode=require` (see
  `src/lib/prisma.ts`). Re-run the connection-limit experiment on the new region.

## 8. Environment variables

Update in Vercel (Preview first, then Production at cutover):
```
DATABASE_URL          → new pooler URL (6543, pgbouncer=true, connection_limit=3)
DIRECT_URL            → new direct URL (5432)
POSTGRES_URL / POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING (if the Supabase
  integration sets them) → new project values
```
Blob (`BLOB_READ_WRITE_TOKEN`), WhatsApp, session and QR secrets are **unchanged**
(Blob and WhatsApp are independent of the DB region).

## 9. Preview deployment + read-only validation

1. Point a Vercel **Preview** at the new DB env vars.
2. Read-only smoke: `BASE_URL=<preview> COOKIE=... npm run perf:smoke` and
   `npm run load:test`.
3. Verify QR scan, dashboard, delivery/return, availability, packing, inventory
   list all load and are faster; no `P2024`.

## 10. Maintenance window, final sync, cutover

1. Announce a short maintenance window (low-traffic hour, IST).
2. Put the app in read-only/maintenance (or accept a brief write freeze).
3. **Final incremental sync**: because a logical dump is point-in-time, either
   (a) take the window immediately after a fresh dump/restore, or (b) use
   Supabase read-replica/`pg_dump` of only tables changed since the backup.
   Simplest safe path: freeze writes → fresh `pg_dump` of changed tables →
   restore → re-verify counts/sequences.
4. **Cutover**: switch Production `DATABASE_URL`/`DIRECT_URL` to the new project;
   redeploy.
5. Re-run sequence fix and verification queries on the new production DB.

## 11. Rollback

- Keep the old project running and untouched during the window.
- Rollback = revert the Vercel env vars to the old URLs and redeploy (the previous
  deployment/commit is known and reproducible).
- Because no destructive change is made to the old DB, rollback is immediate.

## 12. Post-cutover verification

- **WhatsApp webhook**: send a test message; confirm inbound webhook writes and
  outbound slip send still work (Blob + Meta unaffected by DB region).
- **Cron**: confirm `vercel.json` crons (ai-job-worker, watchdog, repair) run
  against the new DB (check worker heartbeat + `/api/health`).
- **Blob independence**: image upload/download works unchanged.
- **pgvector search**: photo search returns matches.

## 13. Estimates

- **Downtime**: ~5–20 min write freeze for the final sync + cutover (data-size
  dependent). Reads can stay warm on the old DB until the env flip.
- **Monthly cost**: a Mumbai Supabase project on the same tier is comparable to
  the current Sydney project (no new tier required); only region differs. Confirm
  current plan pricing before switching. **Do not provision a higher paid tier
  automatically.**

## Do not

- Do not change production DB env vars until the preview validation and final sync
  pass.
- Do not delete the old project until the new one is verified stable for at least
  one full business cycle.
