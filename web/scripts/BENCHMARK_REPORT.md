# Benchmark Report — 15,000 Bookings Stress Test

Generated: 2026-06-29  
Environment: Next.js 15 dev server (`localhost:3000`), PostgreSQL, 1,000 BENCH- items + 15,000 BENCH-BKG- bookings

## Seed statistics

| Metric | Value |
|--------|------:|
| Inventory items (BENCH-) | 1,000 |
| Total bookings (BENCH-BKG-) | 15,000 |
| Overlap clusters (intentional) | 250 |
| Overlap slot assignments (booked/delivered) | 571 |
| Active overlap pairs (same item, intersecting dates) | 1,138 |
| Owner user preserved | yes (`owner`) |

### Bookings by status

| Status | Count |
|--------|------:|
| returned | 6,000 |
| booked | 3,000 |
| delivered | 3,000 |
| cancelled | 1,500 |
| incomplete_return | 750 |
| postponed | 750 |

### Seed scripts

- Base: `node scripts/seed-benchmark-data.mjs` (1k items + 5k bookings)
- Extra: `node scripts/seed-benchmark-bookings-extra.mjs` (+10k bookings, `--reset-extra` to replace)
- Popular wedding dates clustered across 50 calendar dates; 250 items get 3–8 identical-date overlaps each

---

## Test summary

| Suite | Pass | Fail |
|-------|-----:|-----:|
| Overlap / double-booking | 2 | 0 |
| Service layer (`test-benchmark-services.ts`) | 13 | 0 |
| HTTP endpoints (`test-benchmark-full.mjs`, 3 runs each) | 32 | 0 |
| Unit tests (`npm test`) | 12 | 0 |
| Typecheck (`npx tsc --noEmit`) | pass | — |

**Run:** `node scripts/test-benchmark-full.mjs`  
**Raw JSON:** `scripts/benchmark-results.json`

---

## Overlap / double-booking

| Test | Result | Notes |
|------|--------|-------|
| Overlap pairs exist in seed | PASS | 1,138 active pairs |
| `getAvailableItemsApi` excludes hard overlap | PASS | Item excluded when two bookings share identical delivery/return dates |
| `bookingDateCheck` returns `hard_conflict` | PASS | 33ms service-layer |
| `booking/date-check` API | PASS | HTTP 200, p50 83ms |
| Edge handover (return→delivery same day) | PASS | Covered by unit tests in `booking overlap business rules` |

---

## HTTP endpoint matrix

SLOW = p95 > 2,000ms. Times are milliseconds (p50 / p95 / avg).

| Endpoint | Pass | p50 | p95 | avg | Rows | Notes |
|----------|:----:|----:|----:|----:|-----:|-------|
| session/check | ✓ | 79 | 87 | 82 | — | |
| dashboard/data | ✓ | 112 | 842 | 354 | — | Cold-start spike on run 1 |
| dashboard/nav-counts | ✓ | 144 | 1659 | 637 | — | |
| dashboard/free-items | ✓ | 219 | 1037 | 463 | 908 | |
| dashboard/search | ✓ | 141 | 897 | 392 | 50 | |
| returning-today | ✓ | 152 | 848 | 376 | 0 | No returns today |
| returning-today (2026-06-15) | ✓ | 135 | 177 | 147 | 50 | Hot date with data |
| booking-list | ✓ | 186 | 883 | 406 | 20 | |
| booking/available-items | ✓ | 272 | **3053** | 1154 | 904 | **SLOW** cold cache |
| booking/next-serial | ✓ | 167 | 1028 | 433 | — | |
| booking/suggest | ✓ | 147 | 657 | 297 | 12 | |
| search-booking | ✓ | 95 | 604 | 263 | 25 | |
| all-record-search | ✓ | 103 | 774 | 326 | 25 | |
| delivery/search | ✓ | 154 | 849 | 385 | 104 | |
| return/search | ✓ | 212 | 1124 | 511 | 103 | |
| inventory/search | ✓ | 156 | 896 | 385 | — | |
| packing-list | ✓ | 174 | 1138 | 470 | 7 | Improved vs ~2347ms pre-fix |
| categories | ✓ | 84 | 835 | 334 | — | |
| postponed-booking | ✓ | 766 | 1438 | 870 | 750 | Full list, no pagination |
| postponed-booking/search | ✓ | 133 | 145 | 130 | 53 | |
| finance/daily-sale | ✓ | 1286 | **3039** | 1870 | — | **SLOW** aggregates 15k rows |
| finance/daily-booking | ✓ | 1169 | 1914 | 1416 | — | |
| finance/monthly-sale | ✓ | 1178 | 1665 | 1332 | — | |
| finance/yearly-sale | ✓ | 1867 | **2150** | 1782 | — | **SLOW** |
| finance/top-performer | ✓ | 1521 | **3492** | 2158 | 1000 | **SLOW** |
| finance/category-analysis | ✓ | 1287 | 1788 | 1448 | — | |
| finance/security-deposit | ✓ | 70 | 723 | 282 | 0 | |
| finance/inventory-profitability | ✓ | 110 | 790 | 326 | 1006 | |
| admin/calendar-events | ✓ | 377 | 885 | 502 | 457 | |
| admin/activity-log | ✓ | 82 | 710 | 287 | 11 | |
| booking/date-check | ✓ | 83 | 743 | 303 | 1 | |
| dress-checker | ✓ | 158 | 1406 | 562 | 1000 | Scans all items |

---

## Service layer timings

| Service | ms | Rows | Pass |
|---------|---:|-----:|:----:|
| getBookingListData (today) | 250 | 20 | ✓ |
| getAvailableItemsApi (today) | 146 | 904 | ✓ |
| getAvailableItemsApi excludes hard overlap | 59 | 987 | ✓ |
| bookingDateCheck (hard overlap) | 33 | 1 | ✓ |
| monthBasedSearchBookings | 30 | 25 | ✓ |
| universalSearchBookings | 17 | 25 | ✓ |
| dashboardSearchBookings | 8 | 1 | ✓ |
| getManagedCategoryGroups | 10 | 24 | ✓ |
| listPostponedBookings | 330 | 750 | ✓ |
| incomplete_return query | 22 | 50 | ✓ |
| getDailySale | **1706** | 24 | ✓ |
| delivery search (prisma) | 7 | 50 | ✓ |
| return search (prisma) | 7 | 50 | ✓ |

---

## Positives

- **All menus/APIs functional** at 15k bookings — booking list, delivery, return, finance, calendar, activity log, incomplete returns (750 rows), postponed (750), packing list, inventory, search.
- **Double-booking detection works** — `getAvailableItemsApi`, `bookingDateCheck`, and `date-check` API correctly block identical-date overlaps; edge same-day handovers still allowed per business rules.
- **Search stays fast** — booking search, all-record search, delivery/return search all p50 < 220ms.
- **Indexes effective** — booking list, nav-counts, delivery/return search remain sub-second at p50 after overlap indexes applied.
- **Packing list improved** — API route now uses `getPackingListCached` + leaner Prisma selects; p95 dropped from ~2347ms → ~1138ms.
- **Owner user intact** throughout seeding.
- **12/12 unit tests pass** including overlap regression spec.

---

## Negatives / risks

| Issue | Severity | Detail |
|-------|----------|--------|
| `booking/available-items` cold p95 3s | Medium | Loads all 1000 items + all overlapping bookings for date range; warm runs ~140ms |
| `finance/daily-sale` ~1.3–3s | Medium | Full-table aggregation over 15k bookings; service layer 1.7s |
| `finance/top-performer` p95 3.5s | Medium | Returns 1000 rows |
| `finance/yearly-sale` p95 2.1s | Low | Year-wide scan |
| `postponed-booking` list ~770ms p50 | Low | Loads all 750 postponed with includes, no server pagination |
| `dress-checker` p95 1.4s | Low | Checks availability for every inventory item |
| `listPostponedBookings` 330ms | Low | Acceptable but scales linearly |
| Dev cold-start spikes | Info | First request after compile often 2–8× slower (dashboard, nav-counts) |
| Session fragility in long HTTP sweeps | Info | Fixed in test harness by re-login per endpoint; real users unaffected |

No functional bugs found in overlap rules, status flows, or menu data integrity.

---

## Performance fixes applied

| Change | File | Impact |
|--------|------|--------|
| Overlap indexes: `booking_items(item_id)`, `bookings(status, delivery_date, return_date)`, composite `(item_id, booking_id)` | `prisma/migrations/20260629000004_benchmark_overlap_indexes` | Faster overlap/availability queries |
| Packing list API uses `getPackingListCached` (30s TTL) | `src/app/api/packing-list/route.ts` | ~50% p95 reduction on packing-list |
| Lean `select` on `getPackingList` bookings + returning queries | `src/lib/services/operations.ts` | Less data transferred per row |

**Not changed (business logic preserved):** overlap rules, status resolution, finance calculations, pagination limits on user-facing search.

---

## Recommendations for further optimization

1. **Cache `getAvailableItemsApi` / `getDashboardFreeItems`** per `(delivery, return, category)` with 30–60s TTL — biggest user-facing win for booking panel.
2. **Finance endpoints** — pre-aggregate by date/month in SQL (`GROUP BY`), add `unstable_cache` per date range, or materialized views for daily/monthly sale.
3. **`finance/top-performer`** — cap default limit below 1000; paginate on client.
4. **`listPostponedBookings`** — server-side pagination + `select` pruning (mirror booking list pattern).
5. **`dress-checker`** — require minimum query length or category filter before scanning all items.
6. **`getDailySale`** — add date+status composite index if not covered; consider single aggregate query instead of multiple passes.

---

## Commands reference

```bash
# Seed (from web/)
node scripts/seed-benchmark-data.mjs          # first time
node scripts/seed-benchmark-bookings-extra.mjs # +10k bookings
node scripts/seed-benchmark-bookings-extra.mjs --reset-extra

# Tests
node scripts/test-benchmark-full.mjs
npx tsx scripts/test-benchmark-services.ts
npx tsc --noEmit
npm test

# Migrations
npx prisma migrate deploy
```
