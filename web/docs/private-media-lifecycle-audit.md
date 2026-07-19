# Private media lifecycle — storage audit

Audit date: 2026-07-19  
Branch: `feature/private-media-lifecycle`  
Scope: `web/src`, `web/prisma`

> **Note:** Production env var today is `ID_PROOF_BLOB_READ_WRITE_TOKEN`. Part 1 will add `requirePrivateMediaToken()` reading that name (spec alias: `ID_PROOF_READ_WRITE_TOKEN` in docs).

## Summary

| Category | Count | Token | Access |
|----------|-------|-------|--------|
| Permanent inventory | 12+ fields | `BLOB_READ_WRITE_TOKEN` | public |
| Temporary booking (private) | 6 primary fields | `ID_PROOF_BLOB_READ_WRITE_TOKEN` (ID only today) | private (ID only today) |
| **Misclassified (needs Part 1 fix)** | 3 flows | `BLOB_READ_WRITE_TOKEN` | public — should be private |

---

## Audit table

| Image field | DB model | Upload function | Current Blob token | Access | Display route | Inventory vs booking | Current deletion behaviour |
|-------------|----------|-----------------|------------------|--------|---------------|----------------------|----------------------------|
| `photo` | `ClothingItem` | `saveFastInventoryPhotoWithThumb` | `BLOB_READ_WRITE_TOKEN` | public | `photoUrl()` → direct / blob URL | **Inventory** | On item delete/replace via `deleteUpload` (inventory ops) |
| `originalPhoto` | `ClothingItem` | `saveOriginalUpload` / inventory ops | public token | public | `photoUrl()` | **Inventory** | Item delete/replace |
| `enhancedPhoto` | `ClothingItem` | AI enhancer save | public token | public | `photoUrl()` / catalog ref | **Inventory** | Item delete/replace |
| `marketingPhoto` | `ClothingItem` | inventory/marketing flows | public token | public | `photoUrl()` | **Inventory** | Item delete/replace |
| `thumbnailPhoto` | `ClothingItem` | `saveInventoryThumbnailFromBuffer` | public token | public | `photoUrl()` | **Inventory** | Item delete/replace |
| `recognitionImage` | `ClothingItem` | `saveRecognitionBuffer` | public token | public | Admin/dress-checker only | **Inventory** | Item delete/reindex |
| `photo` | `ClothingItemReferencePhoto` | dress-checker correction | public token | public | Admin | **Inventory** | Reference photo delete |
| `photo` | `BookingJewellery` (inventory pick) | Copied from `ClothingItem.photo` | N/A (catalog ref) | public | `photoUrl()` | **Inventory ref** | Never booking cleanup |
| `idPhoto1`, `idPhoto2` | `Booking` | `saveIdProofUpload` → `storePrivateIdProof` | `ID_PROOF_BLOB_READ_WRITE_TOKEN` | private | `idProofUrl()` → `/api/uploads/id-proof` | **Booking private** | Cleared on full return; blob via `blobCleanup` / deferred paths |
| `incompletePhoto` | `Booking` | `saveUpload` via return save route | **public token** | public | `photoUrl()` | **Booking** (should be private) | Cleared on full return; enqueued in `collectFullReturnPhotoPaths` |
| `itemIncompletePhoto` | `BookingItem` | `saveUpload` via return save route | **public token** | public | `photoUrl()` | **Booking** (should be private) | Cleared when item resolved/returned |
| `photo` | `BookingOrder` | `saveUpload` via `/api/uploads/order-photo` | **public token** | public | `photoUrl()` | **Booking** (should be private) | Not tracked; may survive return today |
| `photo` (manual selection) | `BookingJewellery` | `saveUpload` via `/api/uploads/order-photo` | **public token** | public | `photoUrl()` | **Booking** (should be private) | `jewelleryOps` delete on selection remove |
| `photo` (inventory-linked) | `BookingJewellery` | From inventory — no upload | catalog URL | public | `photoUrl()` | **Inventory ref** | N/A |
| `uploadedPhoto` | `DressCheckerCorrection` | Admin upload | public token | public | Admin | **Operational/audit** | Admin lifecycle |
| `queryPhoto`, `catalogPhoto` | Dress search audit models | Search diagnostics | public / path | public | Admin | **Operational** | Retained for audit |
| `sourceImage`, `enhancedImage` | `InventoryAiProfile` etc. | AI pipeline | public token | public | Admin | **Inventory AI** | Profile refresh/delete |
| PDF receipts (`put`) | N/A (blob only) | WhatsApp/slip PDF `put` | public token | public | Signed/served URLs | **Operational docs** | Separate lifecycle |
| DB backup (`put`) | N/A | cron backup | public token | public | N/A | **System** | Retention policy |

---

## Upload entry points (grep)

### Public token (`BLOB_READ_WRITE_TOKEN`)

- `src/lib/upload.ts` — `storeBuffer`, `saveUpload`, `saveFastInventoryPhoto*`, `saveRecognitionBuffer`, `saveOriginalUpload`
- `src/app/api/inventory/route.ts`, `inventory/[id]/route.ts` — dress inventory
- `src/app/api/uploads/order-photo/route.ts` — **order + jewellery manual photos (misclassified)**
- `src/app/api/return/[id]/save/route.ts` — **incomplete return photos (misclassified)**
- `src/app/api/admin/image-sync/route.ts` — bulk image sync
- `src/lib/services/inventoryOps.ts` — inventory create/update
- WhatsApp PDF routes — receipts/bills

### Private token (`ID_PROOF_BLOB_READ_WRITE_TOKEN`)

- `src/lib/upload.ts` — `storePrivateIdProof`, `saveIdProofUpload`
- `src/lib/services/operations.ts` — `saveDeliveryIdPhotos`
- `src/app/api/uploads/id-proof/route.ts` — authenticated proxy GET

### Display helpers

- `photoUrl()` — public paths and blob URLs (direct)
- `idProofUrl()` — wraps private ID in `/api/uploads/id-proof?url=`

---

## Cleanup today (`blobCleanup.ts`)

- `enqueueBlobCleanup` — post-commit job queue
- `isBlobPathStillReferenced` — checks bookings, booking_items, clothing_items, booking_orders, booking_jewellery
- **Risk:** Return cleanup can enqueue paths that include order/jewellery public URLs; `deleteUpload` uses public token
- **Risk:** No `isPermanentInventoryMedia` guard — inventory paths could be deleted if referenced only from booking jewellery inventory copy (same URL string as catalog)
- **Part 2** will add `BookingPrivateMedia` tracking + `scheduleBookingPrivateMediaCleanup`

---

## Part 1 migration targets

1. Create `publicInventoryMedia.ts` + `privateBookingMedia.ts`
2. Re-path inventory uploads under `uploads/inventory/...`
3. Move order photo, jewellery selection photo, incomplete return photo uploads to private store + `/api/uploads/private-media`
4. Add `isPermanentInventoryMedia()` + refuse accidental inventory delete
5. Keep `/api/uploads/id-proof` working; migrate UI to generic private-media route
6. **Do not** implement return cleanup scheduling (Part 2)

## Part 2 targets (after Part 1)

- `BookingPrivateMedia` model + backfill script
- `scheduleBookingPrivateMediaCleanup` after full return commit
- `processPendingPrivateMediaCleanup` worker
- Commit separately from Part 1
