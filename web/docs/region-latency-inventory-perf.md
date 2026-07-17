# Region latency: inventory performance

**Date:** 2026-07-18  
**Scope:** Compare Vercel function region `bom1` (Mumbai) vs Supabase Postgres in `ap-southeast-2` (Sydney) vs colocation options.  
**Production config unchanged:** `web/vercel.json` remains `"regions": ["bom1"]`.

## Current topology

| Layer | Region | Notes |
|-------|--------|-------|
| Vercel serverless (Next.js API + RSC) | `bom1` (Mumbai, ap-south-1) | Set in `vercel.json` |
| Supabase Postgres (typical) | `ap-southeast-2` (Sydney) | Common when project was created in AU/NZ or default APAC pool |
| Staff users | India (primarily) | Mobile + desktop on shop Wi‑Fi / 4G |
| Vercel Blob (inventory photos) | Edge CDN | Thumbnails served from nearest PoP; upload still hits origin |

Each authenticated page load and API call from the app currently pays **one cross-region DB round trip** (Mumbai ↔ Sydney ≈ **80–120 ms RTT** on a clean path) before query execution time.

## Latency model (inventory list)

Typical `/inventory` first paint path:

1. Browser → Vercel `bom1` (edge + function cold/warm)
2. Session/auth check → DB query in Sydney
3. `listInventoryGroups` aggregation → DB
4. Optional client fetch `/api/inventory/list` on filter/pagination → DB again

| Segment | bom1 + ap-southeast-2 DB | Hypothetical bom1 + ap-south-1 DB | Hypothetical Sydney Vercel + ap-southeast-2 DB |
|---------|---------------------------|-----------------------------------|-----------------------------------------------|
| User → compute | **5–25 ms** (India → Mumbai) | **5–25 ms** | **120–180 ms** (India → Sydney) |
| Compute → DB (RTT) | **80–120 ms** | **1–5 ms** (same region) | **1–5 ms** |
| DB query (inventory groups) | **15–80 ms** (depends on count/indexes) | same | same |
| **Extra cross-region tax per request** | **~80–120 ms** | **~0 ms** | N/A (user latency dominates) |

For a list page that runs **2–3 DB round trips** (auth + list + expand group), cross-region adds roughly **160–360 ms** vs colocated compute+DB.

## Option comparison

### A. Keep `bom1` (status quo)

**Pros**

- Best edge latency for Indian staff (HTML/API origin close to users).
- No migration risk; matches current `vercel.json`.
- Works well with client-side optimizations (intent prefetch, bounded caches, `content-visibility`).

**Cons**

- Every server path that touches Postgres pays Sydney RTT.
- Inventory search (pgvector / trgm) and booking overlap checks amplify latency under load.
- Cold starts on Vercel add jitter on top of cross-region RTT.

**Best for:** Short term while measuring; acceptable if p95 list load stays under ~1.5 s on shop 4G.

### B. Move database to ap-south-1 (Mumbai) — colocate with Vercel

**Pros**

- Largest win for **API-heavy** flows: inventory list, dashboard aggregates, booking save, return/delivery.
- Cuts **~80–120 ms per DB hop**; multi-query routes see **200–400 ms** improvement.
- Keeps user → compute latency low for India.

**Cons**

- Supabase region change is a **planned migration** (read replica / new project / downtime window); not done from this repo.
- Blob and AI workers may remain in other regions; photo pipeline latency unchanged.
- Must re-verify backups, pooler URL, and cron jobs after cutover.

**Best for:** Production if owner approves a DB region move; aligns with `docs/production-region-checklist.md`.

### C. Move Vercel to `syd1` / ap-southeast-2 — colocate with DB

**Pros**

- Eliminates compute ↔ DB cross-region RTT.
- Simple config change relative to DB migration (Preview experiment only until approved).

**Cons**

- **Worse for Indian users:** every HTML and API response travels Mumbai → Sydney (~120–180 ms) before DB work.
- Net effect often **slower** for staff in India despite DB colocation.
- Higher TTFB on mobile networks.

**Best for:** Unlikely optimal for this product unless most users move to Australia.

### D. Split architecture (advanced colocation)

Examples: read replica in ap-south-1, write primary in Sydney; or edge caching of **public** thumbnails only (already CDN-backed).

**Pros**

- Can tune read-heavy inventory list toward Mumbai replica.
- Writes stay on primary with defined consistency rules.

**Cons**

- Operational complexity, replication lag, invalidation discipline.
- Supabase read replicas are plan/feature dependent.

**Best for:** Later phase if list traffic grows beyond single-region Postgres.

## Recommendations (no config changes in this task)

1. **Stay on `bom1`** for Vercel until measured Preview comparison completes (see `docs/production-region-checklist.md`).
2. **Prioritize DB region alignment to ap-south-1** over moving Vercel to Sydney — user proximity + DB proximity both favor Mumbai-side DB.
3. **Measure before migrating** using Preview with matched region:
   - `GET /api/inventory/list?q=&limit=40`
   - `GET /api/session/check`
   - `GET /api/dashboard/data`
   - Server-Timing headers already emitted on inventory list API
4. **Keep app-side mitigations** (this branch): intent prefetch, no SW cache of protected HTML/APIs, cache tag invalidation on inventory mutations, list `content-visibility`.

## Risk notes

- Changing only Vercel region without DB move **does not** fix inventory DB latency; it can regress TTFB for India.
- Changing only DB region without redeploy/testing pooler URLs can cause connection failures.
- Do **not** edit `vercel.json` regions in production without owner sign-off and a rollback deployment ready.

## Summary

| Strategy | User latency (India) | DB latency | Overall for inventory list |
|----------|---------------------|------------|----------------------------|
| **bom1 + Sydney DB (now)** | Good | Poor | Moderate; cross-region dominates |
| **bom1 + Mumbai DB** | Good | Excellent | **Best expected** |
| **Sydney Vercel + Sydney DB** | Poor | Excellent | Usually worse for India staff |

**Colocation target:** align **Postgres with `bom1`**, not the reverse.
