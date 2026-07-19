# ID proof private Blob hotfix

Branch: `fix/id-proof-private-blob-upload`  
Date: 2026-07-19

## Root cause

`POST /api/booking-delivery/[id]/id-photos` uploaded ID proofs with `access: "private"` but used `BLOB_READ_WRITE_TOKEN` (public catalogue store). Vercel rejects or misroutes private blobs when the token does not match the private store — production returned **HTTP 400**.

## Fix

- **`ID_PROOF_BLOB_READ_WRITE_TOKEN`** — dedicated private Blob store for customer ID documents only.
- **`BLOB_READ_WRITE_TOKEN`** — unchanged for public inventory/catalogue photos.
- No fallback from private ID uploads to the public token in Production/Preview.

## Files changed

| File | Change |
|------|--------|
| `src/lib/upload.ts` | `IdProofUploadError`, `requireIdProofBlobToken`, `storePrivateIdProof`, validation, private delete token |
| `src/app/api/booking-delivery/[id]/id-photos/route.ts` | Typed HTTP errors + safe logging |
| `src/app/api/uploads/id-proof/route.ts` | Private token for `get` / signed URLs |
| `src/lib/services/operations.ts` | Partial upload strategy (save photo 1 if photo 2 fails) |
| `src/components/DeliveryDetailClient.tsx` | Client compression, status text, retry, sequential uploads |
| `src/app/api/admin/blob-storage/route.ts` | Owner diagnostic (booleans only) |
| `scripts/verify-blob-config.mjs` | Release env check |
| `.env.example`, `docs/release-verification-gate.md` | Document new variable |
| `src/lib/idProofUpload.test.ts` | Expanded unit/static tests |

## Environment variable

```text
ID_PROOF_BLOB_READ_WRITE_TOKEN=<private Vercel Blob store token>
```

Configure a **separate** private Blob store in Vercel; do not reuse the public store token.

Owner check: `GET /api/admin/blob-storage` → `{ publicBlobConfigured, privateIdProofBlobConfigured }`

## Tests

```bash
cd web
npm run typecheck
npx tsx --test src/lib/idProofUpload.test.ts
npm run test:unit
npm run lint
```

## Preview

Not deployed (per constraint). After setting `ID_PROOF_BLOB_READ_WRITE_TOKEN` on Preview, verify delivery ID capture and return-page proxy display.

## Privacy

Customer ID photos use `access: "private"`, opaque blob paths, authenticated `/api/uploads/id-proof` proxy, and never the public catalogue upload path.
