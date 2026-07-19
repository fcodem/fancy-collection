import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isPermanentInventoryMedia,
  REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
} from "./publicInventoryMedia";
import {
  isPrivateBookingMedia,
  requirePrivateMediaToken,
  PrivateMediaError,
} from "./privateBookingMedia";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("isPermanentInventoryMedia", () => {
  it("recognizes new inventory paths", () => {
    assert.equal(isPermanentInventoryMedia("uploads/inventory/dresses/abc.jpg"), true);
    assert.equal(isPermanentInventoryMedia("inventory/thumbnails/x.webp"), true);
    assert.equal(isPermanentInventoryMedia("inventory/recognition/42-rec.jpg"), true);
  });

  it("recognizes legacy inventory paths", () => {
    assert.equal(isPermanentInventoryMedia("thumbs/abc.webp"), true);
    assert.equal(isPermanentInventoryMedia("recognition/12-rec.jpg"), true);
    assert.equal(isPermanentInventoryMedia("originals/abc.jpg"), true);
    assert.equal(isPermanentInventoryMedia("a1b2c3d4e5f6789012345678abcdef01.jpg"), true);
    assert.equal(
      isPermanentInventoryMedia(
        "https://x.public.blob.vercel-storage.com/uploads/inventory/dresses/x.jpg",
      ),
      true,
    );
  });

  it("does not classify private booking media as inventory", () => {
    assert.equal(isPermanentInventoryMedia("uploads/private/orders/x.jpg"), false);
    assert.equal(isPermanentInventoryMedia("id-proofs/x.jpg"), false);
  });
});

describe("isPrivateBookingMedia", () => {
  it("recognizes private folder paths", () => {
    assert.equal(isPrivateBookingMedia("uploads/private/orders/x.jpg"), true);
    assert.equal(isPrivateBookingMedia("uploads/private/incomplete-returns/x.jpg"), true);
    assert.equal(isPrivateBookingMedia("id-proofs/x.jpg"), true);
    assert.equal(
      isPrivateBookingMedia("https://x.private.blob.vercel-storage.com/uploads/private/id-proofs/x.jpg"),
      true,
    );
  });
});

describe("requirePrivateMediaToken", () => {
  it("prefers ID_PROOF_BLOB_READ_WRITE_TOKEN over alias", () => {
    process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN = "primary";
    process.env.ID_PROOF_READ_WRITE_TOKEN = "alias";
    assert.equal(requirePrivateMediaToken(), "primary");
    delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    delete process.env.ID_PROOF_READ_WRITE_TOKEN;
  });

  it("falls back to ID_PROOF_READ_WRITE_TOKEN alias only", () => {
    delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    process.env.ID_PROOF_READ_WRITE_TOKEN = "alias-only";
    assert.equal(requirePrivateMediaToken(), "alias-only");
    delete process.env.ID_PROOF_READ_WRITE_TOKEN;
  });

  it("never falls back to public token", () => {
    delete process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN;
    delete process.env.ID_PROOF_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "public-secret";
    assert.throws(() => requirePrivateMediaToken(), PrivateMediaError);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
});

describe("storage classification contracts (static)", () => {
  const publicMedia = read("src/lib/storage/publicInventoryMedia.ts");
  const privateMedia = read("src/lib/storage/privateBookingMedia.ts");
  const upload = read("src/lib/upload.ts");
  const orderPhotoRoute = read("src/app/api/uploads/order-photo/route.ts");
  const returnSaveRoute = read("src/app/api/return/[id]/save/route.ts");
  const privateMediaRoute = read("src/app/api/uploads/private-media/route.ts");
  const returnPage = read("src/components/ReturnDetailClient.tsx");
  const delivery = read("src/components/DeliveryDetailClient.tsx");

  it("inventory uploads use public token + access public", () => {
    assert.match(publicMedia, /BLOB_READ_WRITE_TOKEN/);
    assert.match(publicMedia, /access: "public"/);
    assert.doesNotMatch(publicMedia, /ID_PROOF_BLOB_READ_WRITE_TOKEN|ID_PROOF_READ_WRITE_TOKEN/);
  });

  it("booking uploads use private token + access private", () => {
    assert.match(privateMedia, /ID_PROOF_BLOB_READ_WRITE_TOKEN/);
    assert.match(privateMedia, /ID_PROOF_READ_WRITE_TOKEN/);
    assert.match(privateMedia, /access: "private"/);
    assert.doesNotMatch(privateMedia, /process\.env\.BLOB_READ_WRITE_TOKEN/);
  });

  it("order and incomplete return routes use private booking upload", () => {
    assert.match(orderPhotoRoute, /savePrivateBookingUpload/);
    assert.match(orderPhotoRoute, /"orders"/);
    assert.match(returnSaveRoute, /savePrivateBookingUpload/);
    assert.match(returnSaveRoute, /"incomplete-returns"/);
    assert.doesNotMatch(orderPhotoRoute, /\bsaveUpload\b/);
  });

  it("private-media route requires auth and no-store cache", () => {
    assert.match(privateMediaRoute, /servePrivateMedia/);
    const serve = read("src/lib/storage/privateMediaServe.ts");
    assert.match(serve, /getCurrentUser/);
    assert.match(serve, /Unauthorized.*401/);
    assert.match(serve, /private, no-store/);
    assert.match(serve, /URL not allowed/);
  });

  it("booking UI uses privateMediaUrl proxy — not raw private blob URLs", () => {
    assert.match(returnPage, /privateMediaUrl\(booking\.idPhoto1\)/);
    assert.match(returnPage, /privateMediaUrl\(booking\.incompletePhoto\)/);
    assert.match(delivery, /privateMediaUrl\(/);
    assert.doesNotMatch(returnPage, /\.private\.blob\.vercel-storage\.com/);
  });

  it("deleteUpload refuses permanent inventory without replacement flag", () => {
    assert.match(upload, /REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA|PermanentInventoryMediaError/);
    assert.match(upload, /allowInventoryReplacement/);
  });

  it("blob cleanup refuses permanent inventory deletion", () => {
    const blobCleanup = read("src/lib/blobCleanup.ts");
    assert.match(blobCleanup, /isPermanentInventoryMedia/);
    assert.match(blobCleanup, new RegExp(REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA));
  });
});

describe("privateMediaUrl helper", async () => {
  it("wraps stored path in authenticated proxy", async () => {
    const { privateMediaUrl } = await import("../photoUrl");
    const url = privateMediaUrl("https://x.private.blob.vercel-storage.com/uploads/private/orders/x.jpg");
    assert.match(url, /^\/api\/uploads\/private-media\?url=/);
  });
});
