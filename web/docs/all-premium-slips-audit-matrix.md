# All Premium Slips — Audit Matrix

Branch: `audit/all-premium-slips` (from `main` @ 87dd2e8)

## Slip inventory

| Slip type | Browser route | React component | PDF generator | WhatsApp job | Fallback (pre-fix) | Status |
| --------- | ------------- | --------------- | ------------- | ------------ | ------------------ | ------ |
| Booking slip | `/booking/[id]/slip` | `BookingSlip.tsx` | `generateBookingSlipPdf` → `POST /api/internal/slip/render` | `booking_bill` | `bookingBillPdfFallback.ts` (jsPDF) | **Fixed** — fallback removed |
| Delivery slip (full) | `/booking/[id]/delivery-slip?scope=full` | `DeliverySlip.tsx` | `generateDeliverySlipPdf` | `delivery_slip` (scope full) | `operationSlipPdfFallback.ts` | **Fixed** |
| Delivery slip (single/partial) | `/booking/[id]/delivery-slip?item=` / `?items=` | `DeliverySlip.tsx` | same + `scope=single\|combined` | `delivery_slip` (scope single/combined) | jsPDF fallback | **Fixed** |
| Return slip (full) | `/booking/[id]/return-slip?scope=full` | `ReturnSlip.tsx` | `generateReturnSlipPdf` | `return_receipt` | jsPDF fallback | **Fixed** |
| Return slip (partial/combined) | `/booking/[id]/return-slip?items=` | `ReturnSlip.tsx` | same + partial opts | `return_slip` | jsPDF fallback | **Fixed** |
| Incomplete return | `/booking/[id]/incomplete-slip` | `IncompleteReturnSlip.tsx` | `generateIncompleteSlipPdf` | `incomplete_slip` | jsPDF fallback | **Fixed** |

## Entry points

| Entry point | Route / trigger | Slip kind | Notes |
| ----------- | --------------- | --------- | ----- |
| Booking details download | `/booking/[id]/slip` + `SlipActionsClient` | booking | Staff session |
| Booking PDF API | `GET /api/booking/[id]/slip/pdf` | booking | Staff |
| Delivery page | `/booking/[id]/delivery-slip` | delivery | Partial via `item` / `items` |
| Delivery PDF API | `GET /api/booking/[id]/delivery-slip` | delivery | |
| Delivery WhatsApp manual | `POST /api/booking/[id]/delivery-slip/whatsapp` | delivery | |
| Return page | `/booking/[id]/return-slip` | return | Partial via `items` |
| Return PDF API | `GET /api/booking/[id]/return-slip` | return | |
| Return WhatsApp manual | `POST /api/booking/[id]/return-slip/whatsapp` | return | |
| Incomplete page | `/booking/[id]/incomplete-slip` | incomplete | Item filter via `items` |
| Incomplete PDF API | `GET /api/booking/[id]/incomplete-slip` | incomplete | |
| Customer Slips hub | `/booking/[id]/customer-slips` | all (links) | Staff session; links to slip pages |
| Public signed QR PDF | `GET /api/public/slip/[kind]/[publicId]` | all | Token-gated; regenerates via Chromium |
| Legacy public booking | `GET /api/public/booking-slip/[publicId]` | booking | |
| Auto WhatsApp on save | `triggerWhatsAppSlipJobs` → `jobQueue` | all | Durable jobs |
| Manual retry | Admin job retry / resend routes | all | |
| Admin resend booking | `POST /api/admin/resend-booking-slips` | booking | |
| Admin retry incomplete | `POST /api/admin/retry-incomplete-slip` | incomplete | |
| Partial delivery | `delivery_slip` job `scope=single` | delivery | One dress |
| Combined delivery | `delivery_slip` job `scope=combined` | delivery | One PDF |
| Partial return | `return_slip` job | return | Delta items |
| Full return | `return_receipt` / `scope=full` | return | |

## Architecture (target)

```
DB → build*SlipData (slipBookingData.ts)
  → Premium React component (BookingSlip / DeliverySlip / ReturnSlip / IncompleteReturnSlip)
  → HTML slip page (?pdfSecret=)
  → POST /api/internal/slip/render (Chromium)
  → assertPremiumSlipPdf
  → download / WhatsApp upload
```

## Fallbacks removed

- `automatedMessages.ts`: all `generateBookingBillPdfFallback` / `generateOperationSlipPdfFallback` customer sends
- Render failure → `PREMIUM_SLIP_RENDER_FAILED` (retryable job, no alternate PDF)

## Renderer reliability

- `pdfBrowserPool.ts`: ENOSPC detection, temp cleanup, one retry
- `slipTempCleanup.ts`: safe prefix-only deletion under OS tmp
- `api/internal/slip/render/route.ts`: diagnostics logging (no PII)
