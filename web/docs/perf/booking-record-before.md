# Booking record performance — baseline audit (pre-optimization)

Audit date: 2026-07-20  
Scope: `/booking/[id]` and related booking workflows (`web/`)

## Route audit summary

| Route | Blocking work before paint | Primary issue |
|-------|---------------------------|---------------|
| `/booking` | 4 parallel Prisma queries, no cache | Year bounds recomputed every request |
| `/booking/[id]` | Auth → booking → warnings (sequential) | Warnings block entire record |
| `/booking/[id]/edit` | Full booking + `item: true` include | Loads entire inventory rows |
| `/search-booking` | Client fetch; API may chain 2–3 queries | No Server-Timing on API |
| `/booking-delivery/[id]` | Delivery detail + warnings + next-day lookup | Multiple heavy includes |
| `/return/[id]` | Full items + photos + warnings | Heavy includes |
| `/jewellery-selection/[id]` | Full booking graph | No lean loader |
| `/booking/[id]/customer-slips` | Booking + WhatsApp docs | Metadata-only (OK); no PDF on load |

## `/booking/[id]` baseline (estimated)

Instrumentation added in `bookingRecordPerf.ts`; pre-refactor behaviour:

| Stage | Typical warm | Typical cold | Notes |
|-------|-------------|--------------|-------|
| authMs | 5–40ms | 40–120ms | Cookie-first via `getCurrentUserForLayout` |
| bookingCoreQueryMs | 80–200ms | 200–500ms | `bookingItems: true` (all columns) |
| warningQueryMs | 150–800ms | 400–2000ms | Span query + `item: true` on edge bookings |
| ordersQueryMs | (in core) | — | Bundled in main query |
| serializeMs | 5–20ms | 10–40ms | Client hydration payload |
| qrMs | 50–300ms | 100–500ms | Already in Suspense |
| **totalMs (blocking)** | **250–1200ms** | **700–3000ms** | Warnings awaited before HTML |

**queryCount (blocking):** 2 (booking + warnings)  
**cacheStatus:** bypass (no record cache)  
**cold:** first request on serverless instance

## Root causes

1. Warning detection runs **before** HTML is sent — slowest query blocks the page.
2. Warning query scans a **date span** and joins full inventory on edge bookings.
3. Booking core uses `bookingItems: true` instead of explicit lean `select`.
4. Internal render self-fetch and panel lack short-lived coalesced cache (panel).
5. No bounded DB concurrency cap on panel (4 simultaneous reads).
6. Edit/delivery/return pages duplicate large Prisma graphs.

## Target (post-optimization)

- Core record visible without waiting for warnings.
- Boundary-only warning query with lean `select`.
- 15–30s revision-keyed core cache after auth.
- Max 2 concurrent read queries per instance on panel/record paths.
