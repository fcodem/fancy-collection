# Central slip renderer & Chromium isolation (Prompt 11)

Branch: `perf/central-slip-renderer`

## Architecture (already centralized, now hardened)

Chromium/Puppeteer is imported in **exactly one module**,
`src/lib/services/whatsapp/pdfBrowserPool.ts`, used only by the single internal
route `POST /api/internal/slip/render`. Every operational path delegates:

```
booking/delivery/return/incomplete save, admin resend, public regenerate,
WhatsApp send  →  durable job / HTTP call  →  slipHtmlPdf.server.ts
                →  POST /api/internal/slip/render  →  pdfBrowserPool (Chromium)
```

`next.config.ts` traces `@sparticuz/chromium` into `/api/internal/slip/render`
only; the `/api/**/*` and `/*` wildcards trace Prisma but never Chromium.
`serverExternalPackages` keeps puppeteer/chromium/transformers/sharp external.

The contract test `src/lib/chromiumIsolation.test.ts` fails the build if any
other module imports Chromium/Puppeteer, if the direct renderer leaks outside
the internal route, or if the trace config regresses.

## Security hardening (this change)

The internal route previously accepted a plain shared-secret header
(`x-pdf-secret`, non-timing-safe string compare). It now requires a signed
request (`src/lib/slipRenderAuth.ts`):

- **HMAC-SHA256** over `timestamp.nonce.bodyHash` using `PDF_RENDER_SECRET`.
- **Timestamp** with a 120s max age (bounds cross-instance replay window).
- **Nonce** with a bounded per-instance replay guard.
- **Body hash** so a captured signature cannot be reused for a different body.
- **Timing-safe** signature comparison.
- **Slip-kind allowlist** (`booking | delivery | return | incomplete`) and
  strict `bookingId` validation, unchanged.
- Raw body is read first and the HMAC covers exactly what is parsed.

Edge middleware only checks that a signature header is present and lets the Node
route verify authoritatively (no booking work happens on failure). The slip
*page* access path (`?pdfSecret=`) is unchanged.

Replay guard is per serverless instance (documented limitation); the 120s
timestamp window bounds cross-instance replay.

## Reliability (unchanged, confirmed)

- Slips are produced through durable WhatsApp/outbox jobs; a render failure does
  not roll back booking/delivery/return (side effects run in `after()` / job
  processing, not inside the DB transaction).
- Transient failures retry; the browser pool retries each render twice.
- jsPDF fallback remains and is now **branded with the logo** for
  delivery/return/incomplete (`operationSlipPdfFallback.ts` loads
  `loadSlipLogoDataUrl()`); booking fallback already embedded the logo.

## Build verification

Static guarantees (verified here):

- Chromium importers: **1** (`pdfBrowserPool.ts`).
- Chromium-traced functions: **1** (`/api/internal/slip/render`).
- Direct-renderer importers: **1** (internal route).

Deployment metrics (function count, largest function, build cache, build
duration, cold start) require a Vercel build and are **not measurable in this
environment**. Expected direction: only one function carries the ~50MB Chromium
binary, so total upload/cache size and cold starts for operational APIs stay
lean. Capture before/after from `vercel inspect` / build logs at deploy time.
