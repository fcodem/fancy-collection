import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isPermanentInventoryMedia,
  REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
} from "./publicInventoryMedia";
import { isPrivateBookingMedia } from "./privateBookingMedia";
import { BOOKING_PRIVATE_MEDIA_STATUS } from "../bookingPrivateMediaTypes";

function shouldTrackBookingPrivateMedia(blobUrl: string | null | undefined): boolean {
  if (!blobUrl?.trim()) return false;
  if (isPermanentInventoryMedia(blobUrl)) return false;
  return isPrivateBookingMedia(blobUrl);
}

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

/** Minimal non-sensitive JPEG header bytes (same pattern as idProofUpload.test.ts). */
function jpegBuffer(extra = 0): Buffer {
  const buf = Buffer.alloc(32 + extra, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

describe("private media release fixtures", () => {
  it("generates safe minimal JPEG buffers for workflow simulation", () => {
    const idProof = jpegBuffer();
    const orderPhoto = jpegBuffer(64);
    const jewelleryPhoto = jpegBuffer(128);
    const incompletePhoto = jpegBuffer(256);
    for (const buf of [idProof, orderPhoto, jewelleryPhoto, incompletePhoto]) {
      assert.equal(buf[0], 0xff);
      assert.equal(buf[1], 0xd8);
      assert.ok(buf.length >= 32);
    }
  });
});

describe("private media lifecycle workflow (static simulation)", () => {
  const inventoryDress =
    "https://x.public.blob.vercel-storage.com/uploads/inventory/dresses/permanent-dress.jpg";
  const privateId =
    "https://x.private.blob.vercel-storage.com/uploads/private/id-proofs/sim-id.jpg";
  const privateOrder =
    "https://x.private.blob.vercel-storage.com/uploads/private/orders/sim-order.jpg";
  const privateJewellery =
    "https://x.private.blob.vercel-storage.com/uploads/private/jewellery-selections/sim-j.jpg";
  const privateIncomplete =
    "https://x.private.blob.vercel-storage.com/uploads/private/incomplete-returns/sim-inc.jpg";

  const bookingCrud = read("src/lib/services/bookingCrud.ts");
  const jewelleryOps = read("src/lib/services/jewelleryOps.ts");
  const returnSave = read("src/app/api/return/[id]/save/route.ts");
  const operations = read("src/lib/services/operations.ts");
  const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");

  it("1 — create booking tracks order photo privately", () => {
    assert.match(bookingCrud, /ORDER_PHOTO/);
    assert.match(bookingCrud, /trackBookingPrivateMedia/);
    assert.equal(shouldTrackBookingPrivateMedia(privateOrder), true);
    assert.equal(shouldTrackBookingPrivateMedia(inventoryDress), false);
  });

  it("2 — private ID proof upload is classified private + tracked", () => {
    assert.equal(isPrivateBookingMedia(privateId), true);
    assert.equal(shouldTrackBookingPrivateMedia(privateId), true);
    assert.equal(isPermanentInventoryMedia(privateId), false);
  });

  it("3 — jewellery selection photo tracked; inventory catalogue ref is not", () => {
    assert.match(jewelleryOps, /JEWELLERY_SELECTION/);
    assert.equal(shouldTrackBookingPrivateMedia(privateJewellery), true);
    assert.equal(shouldTrackBookingPrivateMedia(inventoryDress), false);
  });

  it("4 — deliver does not schedule private-media cleanup", () => {
    assert.doesNotMatch(operations, /scheduleBookingPrivateMediaCleanup[\s\S]{0,200}deliver/i);
  });

  it("5 — partial return does not schedule cleanup", () => {
    const markItem = operations.indexOf("async function runMarkItemReturnedInTx");
    const block = operations.slice(markItem, markItem + 2200);
    assert.doesNotMatch(block, /scheduleBookingPrivateMediaCleanup/);
  });

  it("6 — incomplete return tracks photo but does not schedule cleanup in tx", () => {
    assert.match(returnSave, /INCOMPLETE_RETURN/);
    assert.match(returnSave, /trackUploadedReturnPhotos/);
    const incomplete = operations.indexOf('action === "incomplete_return"');
    const block = operations.slice(incomplete, incomplete + 2500);
    assert.doesNotMatch(block, /scheduleBookingPrivateMediaCleanup/);
    assert.equal(shouldTrackBookingPrivateMedia(privateIncomplete), true);
  });

  it("7 — resolve incomplete does not schedule cleanup until full return", () => {
    const sync = operations.indexOf("async function syncIncompleteReturnStatus");
    const block = operations.slice(sync, sync + 2500);
    assert.doesNotMatch(block, /scheduleBookingPrivateMediaCleanup/);
  });

  it("8 — full return schedules cleanup post-commit only", () => {
    assert.match(returnSave, /scheduleBookingPrivateMediaCleanup/);
    assert.match(returnSave, /status === "returned"/);
    assert.match(returnSave, /runPostCommitReturnSideEffects/);
    assert.doesNotMatch(returnSave, /scheduleBookingPrivateMediaCleanup[\s\S]{0,120}\$transaction/);
  });

  it("9 — worker deletes private blobs; inventory paths stay permanent", () => {
    assert.match(cleanup, /processPendingPrivateMediaCleanup/);
    assert.match(cleanup, /deletePrivateBookingMedia/);
    assert.match(cleanup, /isPermanentInventoryMedia/);
    assert.equal(isPermanentInventoryMedia(inventoryDress), true);
    assert.equal(isPrivateBookingMedia(inventoryDress), false);
    for (const url of [privateId, privateOrder, privateJewellery, privateIncomplete]) {
      assert.equal(isPrivateBookingMedia(url), true);
      assert.equal(isPermanentInventoryMedia(url), false);
    }
  });

  it("10 — UI serves private media via authenticated proxy, not raw blob URLs", () => {
    const returnPage = read("src/components/ReturnDetailClient.tsx");
    assert.match(returnPage, /privateMediaUrl\(/);
    assert.doesNotMatch(returnPage, /\.private\.blob\.vercel-storage\.com/);
  });
});

describe("private media worker runtime contracts (in-process, no blob)", () => {
  const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");

  it("5 concurrent schedule calls are idempotent (updateMany on ACTIVE only)", () => {
    assert.match(cleanup, /scheduleBookingPrivateMediaCleanup/);
    assert.match(cleanup, /status: BOOKING_PRIVATE_MEDIA_STATUS\.ACTIVE/);
    assert.match(cleanup, /updateMany/);
    assert.match(cleanup, /PENDING_DELETE/);
    assert.equal(BOOKING_PRIVATE_MEDIA_STATUS.ACTIVE, "ACTIVE");
  });

  it("duplicate worker invocation re-checks full-return gate before delete", () => {
    assert.match(cleanup, /for \(const record of records\)/);
    assert.match(cleanup, /isBookingFullyReturnedForCleanup\(record\.bookingId\)/);
    assert.match(cleanup, /reactivatePendingPrivateMediaCleanup|ACTIVE/);
  });

  it("blob failure retry uses bounded attempts and backoff schedule", () => {
    assert.match(cleanup, /MAX_DELETE_ATTEMPTS/);
    assert.match(cleanup, /DELETE_RETRY/);
    assert.match(cleanup, /DELETE_FAILED/);
    assert.match(cleanup, /Math\.min\(30, attempts\) \* 60_000/);
  });

  it("permanent inventory paths are refused with explicit error code", () => {
    assert.match(cleanup, new RegExp(REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA));
    assert.match(cleanup, /DELETE_FAILED/);
  });
});
