# Production region checklist

## Current observation

- Vercel project `fcmanage` is configured with region **`bom1`** (Mumbai).
- Supabase Postgres may be hosted in a different region than `bom1`.
- Cross-region round trips increase auth, dashboard, availability and mutation latency.

## Do not change production automatically

Do **not** move or recreate the Supabase database from this repo or agent session.
Do **not** change the production Vercel region without explicit owner approval.

## Recommended preview experiment

1. Create a Vercel **Preview** deployment.
2. Temporarily set Preview function region to match the Supabase region (or the nearest low-latency region).
3. Compare cold/warm timings for:
   - `/api/session/check`
   - `/api/dashboard/data`
   - `/api/booking/available-items`
   - booking create / delivery save / return save
4. Confirm business behaviour (overlap, same-day warnings, finance) is unchanged.
5. Only then schedule a controlled production region change during a quiet window.

## Expected effects of matching regions

| Area | Expected change |
|------|-----------------|
| Authentication | Lower cookie+DB validation latency |
| Dashboard | Faster aggregate queries |
| Availability | Faster inventory + overlap scans |
| Booking transactions | Lower lock wait + commit latency |

## Deployment checklist (after code merge)

1. Apply additive Prisma migrations on a reviewed path (`prisma migrate deploy`).
2. Confirm `whatsapp_jobs.idempotency_key`, claim columns, `mutation_receipts`, `blob_cleanup_jobs` exist.
3. Smoke-test booking → delivery (selected combined slip) → return (selected combined slip).
4. Confirm WhatsApp jobs show status `done` (not `completed`).
5. Confirm blob cleanup cron is authorized with `CRON_SECRET`.
6. Keep `DATABASE_URL` on transaction pooler `:6543`; keep `DIRECT_URL` for migrations.

## Rollback

1. Redeploy previous Vercel deployment / git revert.
2. Leave additive tables in place (safe); stop using new code paths.
3. Do not drop tables in production as part of rollback unless separately approved.
