# Booking record performance — post-optimization

## Changes summary

| Metric | Before (blocking) | After (blocking) |
|--------|-------------------|------------------|
| DB queries before HTML | 2 (core + warnings) | 1 (cached core) |
| Warning query scope | Full date span + `item: true` | Two boundary dates, lean `select` |
| Panel concurrent reads | 4 (`Promise.all`) | Max 2 (`AsyncSemaphore`) |
| Panel year bounds | Every request | 5 min memory cache |
| Panel page | Uncached | 20s revision-keyed cache |
| Search API | No timer/cache | 15s cache + Server-Timing |

## Streaming sections

- `BookingRecordLoadingSkeleton` — instant route skeleton
- Core record — immediate after auth + cached core query
- `BookingWarningsAsync` — Suspense boundary (non-blocking)
- `BookingQrDisplay` — existing Suspense boundary

## Cache design

- **Key:** `booking-record-core:{bookingId}:{shopRevision}`
- **TTL:** 20 seconds
- **Auth:** Always before cache read
- **Invalidation:** `invalidateBookingCaches()` clears memory cache + `booking-record` tag on mutations

## Indexes

No new migration — existing indexes on `bookings(delivery_date, status)`, `bookings(return_date, status)`, and `booking_items(item_id)` already support boundary queries.

## Cross-region latency

If Vercel (e.g. Mumbai/BOM) and Postgres (e.g. US) differ, expect +100–250ms RTT per query. Core-only path reduces round-trips from 2+ to 1 blocking.

## Verification

- `npm run typecheck` — pass
- `npm run test:unit` — 598 pass
- `npm run lint` — pass (pre-existing warnings only)
- `npm run build` — pass
