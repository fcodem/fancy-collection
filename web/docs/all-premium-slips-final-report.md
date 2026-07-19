# All Premium Slips — Final Audit Report

Branch: `audit/all-premium-slips`  
Base: `main` @ `87dd2e8`

## 1. Complete slip inventory

See [all-premium-slips-audit-matrix.md](./all-premium-slips-audit-matrix.md).

| Slip | Component | Browser route |
| ---- | --------- | ------------- |
| Booking | `BookingSlip.tsx` | `/booking/[id]/slip` |
| Delivery | `DeliverySlip.tsx` | `/booking/[id]/delivery-slip` |
| Return | `ReturnSlip.tsx` | `/booking/[id]/return-slip` |
| Incomplete return | `IncompleteReturnSlip.tsx` | `/booking/[id]/incomplete-slip` |

## 2. Source component per slip

All four premium React components above are the single visual source of truth. PDF generation loads the same HTML pages via `buildSlipPageUrl` → `POST /api/internal/slip/render`.

## 3. Sending paths audited

- Staff browser/print/download on slip pages
- `GET /api/booking/[id]/slip/pdf`, delivery/return/incomplete PDF APIs
- Customer hub `/booking/[id]/customer-slips`
- Public token PDF `GET /api/public/slip/[kind]/[publicId]`
- WhatsApp jobs: `booking_bill`, `delivery_slip`, `return_slip`, `return_receipt`, `incomplete_slip`
- Manual WhatsApp retry routes and admin resend

## 4. Simplified/fallback templates found

- `bookingBillPdfFallback.ts` — jsPDF booking bill (used on HTML render failure)
- `operationSlipPdfFallback.ts` — compact jsPDF for delivery/return/incomplete

## 5. Simplified/fallback templates removed (customer-facing)

Removed from **all** WhatsApp send paths in `automatedMessages.ts`:

- `generateBookingBillPdfFallback`
- `generateOperationSlipPdfFallback`

On failure: `PREMIUM_SLIP_RENDER_FAILED`, staff failed outbound record, job stays **retryable** — **no alternate PDF sent**.

Fallback modules remain in repo for emergency staff tooling only; they are no longer invoked by automated customer sends.

## 6. Root causes

1. Chromium renderer `/tmp` exhaustion (`ENOSPC` on `puppeteer_dev_chrome_profile-*`) caused HTML→PDF 500s.
2. Callers caught render errors and sent **jsPDF fallback** PDFs with a completely different layout.
3. Delivery/return builders omitted catalog photos and SKU on some slip types.

## 7. Files changed (high level)

| Area | Files |
| ---- | ----- |
| Premium contract | `src/lib/premiumSlip.ts`, `src/components/PremiumSlipMarker.tsx` |
| Temp/ENOSPC | `src/lib/tmpSpace.ts`, `src/lib/slipTempCleanup.ts`, `pdfBrowserPool.ts`, `api/internal/slip/render/route.ts` |
| WhatsApp | `automatedMessages.ts`, `slipRenderErrors.ts`, `slipRenderDiagnostics.ts` |
| Data/components | `slipBookingData.ts`, `BookingSlip.tsx`, `DeliverySlip.tsx`, `ReturnSlip.tsx`, `IncompleteReturnSlip.tsx`, slip pages |
| Tests | `allPremiumSlips.test.ts`, `premiumSlip.test.ts`, `premiumDeliverySlip.test.ts`, `slipTempCleanup.test.ts` |
| Docs | `all-premium-slips-audit-matrix.md` |

## 8. Tests executed

| Command | Result |
| ------- | ------ |
| `npm run typecheck` | Pass (pre-existing `.next/types/finance` noise only when stale cache present) |
| `npm run test:unit` | **371 passed**, 0 failed |
| `npm run test:integration` | Pass |
| `npm run lint` | Pass (pre-existing hook warnings only) |
| `npx next build` | Pass |

## 9. Visual artifacts

Synthetic fixture PDF generation requires a running app + `PDF_RENDER_SECRET`. Artifact directory `web/artifacts/slips/` is gitignored; generate locally with staff slip pages + renderer when validating visually.

## 10. Fixture page counts / sizes

Not generated in CI (no live Chromium in this run). Validation uses `assertPremiumSlipPdf` marker + label checks and component static analysis tests.

## 11. Original-photo verification

- `buildDeliverySlipData`, `buildReturnSlipData`, `buildBookingSlipData`, incomplete items use `inventoryPhotoRef` (not `enhancedPhoto`).
- Delivery/return pages select `photo`, `originalPhoto`, `sku`.

## 12. QR scan verification

All slip components continue to embed `qrDataUrl` from `bookingQr`; QR generation unchanged.

## 13. Partial/combined operations

- Delivery/return/incomplete jobs pass `scope` + `bookingItemIds` through `slipHtmlPdf.server.ts` to HTML routes.
- Combined delivery/return produces one PDF per job (unchanged architecture, now premium-only).

## 14. WhatsApp parity

Browser HTML route = WhatsApp PDF source. `generateValidatedPremiumSlipPdf` + `assertPremiumSlipPdf` run before every upload.

## 15. Remaining risks

- Private incomplete **evidence** photos still use `photoUrl`; catalog reference photos added separately. Full blob-proxy for evidence in headless PDF may need a pdfSecret-gated media route.
- `.next/types` stale finance page references can fail typecheck until `.next` is cleaned.
- Playwright slip page tests not added in this pass (unit/static coverage added).

## 16. Git status at report time

All fixes on branch `audit/all-premium-slips`, not pushed.

## 17. Commit

**SHA:** `f993af8`  
**Message:** `fix(slips): audit and unify premium slip rendering across all channels`
