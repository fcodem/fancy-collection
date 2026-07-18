# Release verification gate (Prompt 13, Part B)

Branch: `docs/staging-and-database-cutover`

## One command

```bash
npm run verify:release
```

Runs, in order (stops on first failure):

1. `typecheck` — `tsc --noEmit`
2. `test:unit` — full `node:test` suite (231+ tests)
3. `test:integration` — local Postgres integration checks
4. `lint` — `next lint`
5. `build` — `prisma generate && next build`
6. `test:e2e` — Playwright E2E
7. `perf:smoke` — performance smoke test against `BASE_URL`

### Environment

- `test:integration` needs a reachable local/staging Postgres (uses `DIRECT_URL`).
- `test:e2e` needs Playwright browsers installed (`npx playwright install`) and,
  depending on config, a running app.
- `perf:smoke` needs `BASE_URL` (and `COOKIE` for authenticated routes). Without
  `BASE_URL` it **skips with a notice** (exit 0) so the command runs in envs
  without a deployment. **A real release gate MUST set `BASE_URL`+`COOKIE`.**

```bash
BASE_URL="https://<preview>.vercel.app" COOKIE="fc_session=..." npm run verify:release
```

## Required staging scenarios

Exercise on the preview/staging deployment (via `perf:smoke`, `load:test`, and
manual/E2E where noted):

- QR scan → booking; QR scan → Jewellery
- Dashboard; Today Orders
- Delivery list; Return list
- Free Items; Packing List; Jewellery availability
- Inventory Save (one click)
- Slip rendering (booking/delivery/return/incomplete)
- Session force logout
- 5–10 concurrent users (`npm run load:test`)
- Mobile and tablet (incl. landscape) layouts

## Performance report (produced by `perf:smoke` / `load:test`)

For each scenario: `warm p50`, `warm p95`, `cold`, `dbWait`, `auth`, `query`,
`payload bytes`, `request count`, HTTP status, and warm/cold target pass. JS size
and image bytes are read from the deployment (Network panel / build output) and
recorded alongside.

Targets enforced by `perf:smoke`:

| Scenario | Warm p95 | Cold |
|----------|----------|------|
| QR resolve | 50 ms | 300 ms |
| Dashboard data | 700 ms | 1500 ms |
| Nav counts | 400 ms | 1000 ms |
| Delivery / Return search | 700 ms | 1500 ms |
| Availability | 800 ms | 1500 ms |
| Packing list | 700 ms | 1500 ms |
| Inventory list | 800 ms | 1500 ms |

`load:test` targets: no `P2024`, no pool timeout, no 5xx, no request > 5 s across
5 dashboards / 10 nav-counts / 10 delivery / 10 return / 10 availability / 5
inventory concurrent requests.

## Release acceptance criteria (do NOT deploy unless all true)

- [ ] No pool timeout (`P2024`) under `load:test`
- [ ] No database connectivity error during tests
- [ ] QR resolver under target
- [ ] Dashboard essential content under target
- [ ] Delivery and Return under target
- [ ] Availability under target
- [ ] Inventory Save is one click (E2E + manual)
- [ ] Chromium isolated (contract test `chromiumIsolation.test.ts` green)
- [ ] AI cannot affect normal routes (contract test `aiWorkerIsolation.test.ts` green)
- [ ] Git working tree clean (`git status` → nothing to commit)
- [ ] Exact source committed and reproducible from GitHub
- [ ] Rollback tested (revert env/commit → previous known-good deploy)

## Status in this environment

`typecheck`, `test:unit`, `test:integration`, `lint`, and `build` pass locally on
every branch in this series. `test:e2e` and `perf:smoke`/`load:test` require a
staging deployment, Playwright browsers, and real devices, which are **not
available in this environment** — run them against a Vercel Preview before
approving production. Do not approve production deployment until every box above
is checked with real staging numbers.
