import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formDataToFile } from "./formDataFile";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

function jpegBuffer(extra = 0): Buffer {
  const buf = Buffer.alloc(32 + extra, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

describe("formDataToFile", () => {
  it("accepts Blob uploads from mobile browsers", () => {
    const blob = new Blob(["fake-image"], { type: "image/jpeg" });
    const file = formDataToFile(blob, "id_photo_1.jpg");
    assert.ok(file);
    assert.equal(file!.name, "id_photo_1.jpg");
    assert.equal(file!.type, "image/jpeg");
    assert.ok(file!.size > 0);
  });

  it("rejects empty blobs and string form fields", () => {
    assert.equal(formDataToFile(new Blob([]), "id_photo_1.jpg"), null);
    assert.equal(formDataToFile("not-a-file", "id_photo_1.jpg"), null);
  });
});

describe("ID proof upload contracts (static)", () => {
  const upload = read("src/lib/upload.ts");
  const idProofRoute = read("src/app/api/uploads/id-proof/route.ts");
  const idPhotosRoute = read("src/app/api/booking-delivery/[id]/id-photos/route.ts");
  const delivery = read("src/components/DeliveryDetailClient.tsx");
  const returnPage = read("src/components/ReturnDetailClient.tsx");
  const operations = read("src/lib/services/operations.ts");

  it("uses separate private token for ID proofs — never public token fallback", () => {
    const privateMedia = read("src/lib/storage/privateBookingMedia.ts");
    const uploadBlock = read("src/lib/upload.ts").slice(
      read("src/lib/upload.ts").indexOf("export async function storePrivateIdProof"),
      read("src/lib/upload.ts").indexOf("/** Private customer ID proof"),
    );
    assert.match(privateMedia, /ID_PROOF_BLOB_READ_WRITE_TOKEN/);
    assert.match(privateMedia, /access: "private"/);
    assert.doesNotMatch(privateMedia, /process\.env\.BLOB_READ_WRITE_TOKEN/);
    assert.match(uploadBlock, /savePrivateBookingMedia/);
  });

  it("public inventory uploads still use BLOB_READ_WRITE_TOKEN", () => {
    const publicMedia = read("src/lib/storage/publicInventoryMedia.ts");
    assert.match(publicMedia, /BLOB_READ_WRITE_TOKEN/);
    assert.match(publicMedia, /access: "public"/);
  });

  it("id-proof proxy uses private token helpers", () => {
    const serve = read("src/lib/storage/privateMediaServe.ts");
    assert.match(serve, /requirePrivateMediaToken/);
    assert.doesNotMatch(serve, /BLOB_READ_WRITE_TOKEN/);
    assert.match(serve, /private, no-store/);
    assert.match(serve, /nosniff/);
  });

  it("id-photos route maps typed errors to HTTP status codes", () => {
    assert.match(idPhotosRoute, /IdProofUploadError/);
    assert.match(idPhotosRoute, /idProofErrorHttpStatus/);
    assert.match(idPhotosRoute, /ok: false/);
    assert.match(idPhotosRoute, /\[id-proof-upload\]/);
  });

  it("return page uses privateMediaUrl helper for ID photos", () => {
    assert.match(returnPage, /privateMediaUrl\(booking\.idPhoto1\)/);
    assert.match(returnPage, /privateMediaUrl\(booking\.idPhoto2\)/);
  });

  it("delivery UI compresses before upload and shows status messages", () => {
    assert.match(delivery, /compressImageFile/);
    assert.match(delivery, /Preparing ID photo/);
    assert.match(delivery, /Uploading ID photo/);
    assert.match(delivery, /ID photo saved/);
    assert.match(delivery, /Retry/);
    assert.match(delivery, /never block deliver/i);
  });

  it("operations preserves existing photo when replacement upload fails", () => {
    assert.match(operations, /partialFailure/);
    assert.match(operations, /deleteUpload\(idPhoto1\)/);
  });

  it("id-photos route does not import public catalogue upload helpers", () => {
    assert.doesNotMatch(idPhotosRoute, /saveUpload|saveFastInventoryPhoto|saveCompressedFromBuffer/);
  });

  it("finalizeFullReturnIfComplete defers blob cleanup until after commit", () => {
    const start = operations.indexOf("async function finalizeFullReturnIfComplete");
    const end = operations.indexOf("async function syncIncompleteReturnStatus");
    const block = operations.slice(start, end);
    assert.doesNotMatch(block, /clearBookingIdPhotos|clearIncompletePhotos|enqueueBlobCleanup/);
    assert.match(block, /collectFullReturnPhotoPaths/);
    assert.match(block, /return paths/);
  });

  it("syncIncompleteReturnStatus defers blob cleanup when closing to returned", () => {
    const start = operations.indexOf("async function syncIncompleteReturnStatus");
    const end = operations.indexOf("function warnFromBooking");
    const block = operations.slice(start, end);
    assert.doesNotMatch(block, /clearBookingIdPhotos|clearIncompletePhotos|enqueueBlobCleanup/);
    assert.match(block, /collectFullReturnPhotoPaths/);
    assert.match(block, /return paths/);
  });

  it("blob cleanup reschedules still_referenced jobs instead of permanent skip", () => {
    const blobCleanup = read("src/lib/blobCleanup.ts");
    const start = blobCleanup.indexOf("if (await isBlobPathStillReferenced");
    const block = blobCleanup.slice(start, start + 450);
    assert.match(block, /status:\s*"pending"/);
    assert.doesNotMatch(block, /status:\s*"skipped"/);
    assert.match(block, /still_referenced/);
    assert.match(block, /30_000/);
  });

  it("order photo uploads use private booking media route", () => {
    const orderPhotoRoute = read("src/app/api/uploads/order-photo/route.ts");
    const jewellery = read("src/components/JewellerySelectionClient.tsx");
    const bookingForm = read("src/components/BookingFormClient.tsx");
    assert.match(orderPhotoRoute, /savePrivateBookingUpload/);
    assert.match(orderPhotoRoute, /"orders"/);
    assert.doesNotMatch(orderPhotoRoute, /\bsaveUpload\b/);
    assert.match(jewellery, /\/api\/uploads\/order-photo/);
    assert.match(bookingForm, /\/api\/uploads\/order-photo/);
  });
});

describe("validateIdProofUpload", async () => {
  const { validateIdProofUpload, IdProofUploadError } = await import("./upload");

  it("rejects empty files", () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    assert.throws(
      () => validateIdProofUpload(file, Buffer.alloc(0)),
      (e: unknown) => e instanceof IdProofUploadError && e.code === "EMPTY_FILE",
    );
  });

  it("rejects oversized files", () => {
    const raw = jpegBuffer(6 * 1024 * 1024);
    const file = new File([raw], "big.jpg", { type: "image/jpeg" });
    assert.throws(
      () => validateIdProofUpload(file, raw),
      (e: unknown) => e instanceof IdProofUploadError && e.code === "FILE_TOO_LARGE",
    );
  });

  it("rejects HEIC bytes", () => {
    const raw = Buffer.from("....ftypheic....", "ascii");
    const file = new File([raw], "scan.heic", { type: "image/heic" });
    assert.throws(
      () => validateIdProofUpload(file, raw),
      (e: unknown) => e instanceof IdProofUploadError && e.code === "INVALID_FILE",
    );
  });

  it("accepts valid JPEG bytes", () => {
    const raw = jpegBuffer();
    const file = new File([raw], "id.jpg", { type: "image/jpeg" });
    assert.equal(validateIdProofUpload(file, raw), "jpg");
  });
});

describe("storePrivateIdProof token behaviour", () => {
  it("requireIdProofBlobToken throws when unset on prod-like env", async () => {
    const prev = process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    const prevAlias = process.env.ID_PROOF_READ_WRITE_TOKEN;
    const prevVercel = process.env.VERCEL;
    delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    delete process.env.ID_PROOF_READ_WRITE_TOKEN;
    process.env.VERCEL = "1";
    const { storePrivateIdProof, IdProofUploadError } = await import("./upload");
    await assert.rejects(
      () => storePrivateIdProof(jpegBuffer(), "jpg"),
      (e: unknown) => e instanceof IdProofUploadError && e.code === "PRIVATE_BLOB_NOT_CONFIGURED",
    );
    if (prev) process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN = prev;
    else delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    if (prevAlias) process.env.ID_PROOF_READ_WRITE_TOKEN = prevAlias;
    else delete process.env.ID_PROOF_READ_WRITE_TOKEN;
    if (prevVercel) process.env.VERCEL = prevVercel;
    else delete process.env.VERCEL;
  });
});

describe("getBlobStorageConfig", async () => {
  const { getBlobStorageConfig } = await import("./upload");

  it("never exposes token values", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "public-secret";
    process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN = "private-secret";
    const cfg = getBlobStorageConfig();
    assert.equal(cfg.publicBlobConfigured, true);
    assert.equal(cfg.privateIdProofBlobConfigured, true);
    assert.doesNotMatch(JSON.stringify(cfg), /secret/);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
  });
});

describe("idProofErrorHttpStatus", async () => {
  const { idProofErrorHttpStatus } = await import("./upload");

  it("maps codes to expected HTTP statuses", () => {
    assert.equal(idProofErrorHttpStatus("PRIVATE_BLOB_NOT_CONFIGURED"), 503);
    assert.equal(idProofErrorHttpStatus("FILE_TOO_LARGE"), 413);
    assert.equal(idProofErrorHttpStatus("INVALID_FILE"), 415);
    assert.equal(idProofErrorHttpStatus("BLOB_UPLOAD_FAILED"), 502);
  });
});

describe("photoUrl privacy", () => {
  it("idProofUrl wraps stored path in authenticated proxy", async () => {
    const { idProofUrl } = await import("./photoUrl");
    const url = idProofUrl("https://x.private.blob.vercel-storage.com/uploads/id-proofs/x.jpg");
    assert.match(url, /^\/api\/uploads\/id-proof\?url=/);
  });
});
