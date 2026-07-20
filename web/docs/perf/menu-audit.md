# Menu loading performance audit

Audit date: 2026-07-20  
Scope: all routes from `AppShell.tsx` `ALL_NAV`

## Priority menus (confirmed slow)

| Menu | Route | Queries (before) | API (before) | Problem |
|------|-------|------------------:|-------------:|---------|
| Booked Items | `/booking-list` | 2 unbounded + warnings | 1 | No pagination, jewellery photos, O(n²) dedup, PDF inline |
| Late Returns | `/late-return` | 2 + full span warnings | 0 | Broad include, PDF blocks render, no pagination |
| Staff Attendance | `/staff-attendance` | 2 server + 4 client | 4 on load | Salary APIs on mount, N upserts, filter loops |

## All navigation routes

| Menu | Route | Status |
|------|-------|--------|
| Dashboard | `/` | Prior perf work |
| Booking Panel | `/booking` | Prior perf work (panel cache) |
| Search Booking | `/search-booking` | Cached API |
| Free Item List | `/free-items` | List pagination audit |
| Booking Delivery | `/booking-delivery` | Client search + revalidate 30 |
| Jewellery Selection | `/jewellery-selection` | Record page |
| Return | `/return` | Client search |
| Packing List | `/packing-list` | List route |
| **Booked Items** | `/booking-list` | **Optimized this pass** |
| Returning Today | `/returning-today` | List |
| Dress Search | `/inventory/search` | Search API |
| Dress Availability | `/dress-checker` | noPrefetch |
| Manage Inventory | `/inventory` | Paginated |
| Search QR | `/search-qr` | Lookup |
| **Late Returns** | `/late-return` | **Optimized this pass** |
| All Record Search | `/all-record-search` | Search |
| Postponed Bookings | `/postponed-booking` | List |
| Remaining to Deliver | `/remaining-to-deliver` | List |
| Incomplete Return | `/incomplete-return` | List |
| Prospect & Enquiries | `/prospect-leads` | List |
| Manage Categories | `/manage-categories` | Settings |
| Finance * (9 routes) | `/finance/*` | Report pages |
| Owner * (11 routes) | `/admin/*`, `/customers`, etc. | Admin lists |
| **Staff Attendance** | `/staff-attendance` | **Optimized this pass** |
| WhatsApp * (5 routes) | `/whatsapp/*` | Inbox paginated |
| AI Features | `/ai-features` | Hub only |

## Instrumentation

Set `PERF_LOG_ALL=1` or route-specific env flags. Logs include: `requestId`, `authMs`, `queryMs`, `totalMs`, `queryCount`, `cacheStatus`, `rowCount`, `cold`. No PII.
