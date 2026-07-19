import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA } from "./storage/publicInventoryMedia";
import { BOOKING_PRIVATE_MEDIA_STATUS, BOOKING_PRIVATE_MEDIA_TYPES } from "./bookingPrivateMediaTypes";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("booking private media lifecycle (static contracts)", () => {
  const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");
  const tracking = read("src/lib/bookingPrivateMediaTracking.ts");
  const operations = read("src/lib/services/operations.ts");
  const returnSave = read("src/app/api/return/[id]/save/route.ts");
  const blobCleanup = read("src/lib/blobCleanup.ts");
  const cronRoute = read("src/app/api/cron/blob-cleanup/route.ts");
  const backfill = read("scripts/backfill-booking-private-media.ts");
  const schema = read("prisma/schema.prisma");

  it("1 — full return schedules cleanup post-commit", () => {
    assert.match(returnSave, /scheduleBookingPrivateMediaCleanup/);
    assert.match(returnSave, /status === "returned"/);
    assert.match(returnSave, /runPostCommitReturnSideEffects/);
    assert.doesNotMatch(returnSave, /scheduleBookingPrivateMediaCleanup[\s\S]{0,120}\$transaction/);
  });

  it("2 — partial return does not schedule cleanup inside transaction", () => {
    const markItem = operations.indexOf("async function runMarkItemReturnedInTx");
    const block = operations.slice(markItem, markItem + 2200);
    assert.doesNotMatch(block, /scheduleBookingPrivateMediaCleanup/);
  });

  it("3 — incomplete return path does not schedule private-media cleanup in tx", () => {
    const incomplete = operations.indexOf('action === "incomplete_return"');
    const block = operations.slice(incomplete, incomplete + 2500);
    assert.doesNotMatch(block, /scheduleBookingPrivateMediaCleanup/);
  });

  it("4 — no dispute hold field; worker re-checks full return gate", () => {
    assert.match(cleanup, /isBookingFullyReturnedForCleanup/);
    assert.match(cleanup, /No dispute\/hold field exists on Booking today/);
    assert.match(cleanup, /incomplete_return/);
  });

  it("5 — failed return transaction schedules nothing (post-commit only)", () => {
    assert.match(returnSave, /if \(!reused\)/);
    assert.match(returnSave, /runPostCommitReturnSideEffects/);
  });

  it("6 — blob deletion uses try/catch; return tx commits separately", () => {
    assert.match(cleanup, /try \{[\s\S]*deletePrivateBookingMedia/);
    assert.match(returnSave, /prisma\.\$transaction/);
    assert.match(returnSave, /runPostCommitReturnSideEffects/);
  });

  it("7 — inventory images are never tracked", () => {
    assert.match(tracking, /isPermanentInventoryMedia/);
    assert.match(tracking, /shouldTrackBookingPrivateMedia/);
    assert.match(backfill, /shouldTrackBookingPrivateMedia/);
    assert.match(backfill, /inventory-linked photo/);
  });

  it("8 — ID proofs tracked and cleaned with private delete", () => {
    assert.match(operations, /BOOKING_PRIVATE_MEDIA_TYPES\.ID_PROOF/);
    assert.match(cleanup, /deletePrivateBookingMedia/);
    assert.equal(BOOKING_PRIVATE_MEDIA_TYPES.ID_PROOF, "ID_PROOF");
  });

  it("9 — jewellery-selection photos tracked", () => {
    const jewelleryOps = read("src/lib/services/jewelleryOps.ts");
    assert.match(jewelleryOps, /JEWELLERY_SELECTION/);
    assert.match(jewelleryOps, /shouldTrackBookingPrivateMedia/);
  });

  it("10 — order photos tracked on booking create", () => {
    const bookingCrud = read("src/lib/services/bookingCrud.ts");
    assert.match(bookingCrud, /ORDER_PHOTO/);
    assert.match(bookingCrud, /trackBookingPrivateMedia/);
  });

  it("11 — incomplete-return photos tracked at return save", () => {
    assert.match(returnSave, /INCOMPLETE_RETURN/);
    assert.match(returnSave, /trackUploadedReturnPhotos/);
  });

  it("12 — legacy URL fields cleared only on exact match after delete", () => {
    assert.match(cleanup, /clearExactLegacyReference/);
    assert.match(cleanup, /=== blobUrl/);
    assert.match(cleanup, /source: "manual"/);
  });

  it("13 — failed blob deletion retries with backoff", () => {
    assert.match(cleanup, /DELETE_RETRY/);
    assert.match(cleanup, /MAX_DELETE_ATTEMPTS/);
    assert.match(cleanup, /DELETE_FAILED/);
  });

  it("14 — duplicate tracking rows are idempotent", () => {
    assert.match(tracking, /findFirst/);
    assert.match(tracking, /status: \{ not: BOOKING_PRIVATE_MEDIA_STATUS\.DELETED \}/);
    assert.match(backfill, /existingKeys/);
  });

  it("15 — permanent inventory deletion protection in worker", () => {
    assert.match(cleanup, /isPermanentInventoryMedia/);
    assert.match(cleanup, new RegExp(REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA));
  });

  it("16 — replacement URLs not cleared (exact match only)", () => {
    assert.match(cleanup, /if \(booking\.idPhoto1 === blobUrl\)/);
    const jewelleryOps = read("src/lib/services/jewelleryOps.ts");
    assert.match(jewelleryOps, /entry\.photo !== newPhoto/);
  });

  it("17 — cleanup uses private token helper", () => {
    const privateMedia = read("src/lib/storage/privateBookingMedia.ts");
    assert.match(cleanup, /deletePrivateBookingMedia/);
    assert.match(privateMedia, /requirePrivateMediaToken/);
    assert.doesNotMatch(cleanup, /BLOB_READ_WRITE_TOKEN/);
  });

  it("18 — cleanup module avoids customer-sensitive logging", () => {
    assert.doesNotMatch(cleanup, /console\.(log|info|warn|error)/);
    assert.doesNotMatch(cleanup, /customerName|contact1|whatsapp/i);
  });
});

describe("booking private media schema + worker wiring", () => {
  it("defines BookingPrivateMedia model and statuses", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /model BookingPrivateMedia/);
    assert.match(schema, /@@map\("booking_private_media"\)/);
    assert.equal(BOOKING_PRIVATE_MEDIA_STATUS.PENDING_DELETE, "PENDING_DELETE");
    assert.equal(BOOKING_PRIVATE_MEDIA_TYPES.ORDER_PHOTO, "ORDER_PHOTO");
  });

  it("cron blob-cleanup runs private-media worker", () => {
    const cronRoute = read("src/app/api/cron/blob-cleanup/route.ts");
    assert.match(cronRoute, /processPendingPrivateMediaCleanup/);
  });

  it("operations defer blob cleanup until after commit", () => {
    const operations = read("src/lib/services/operations.ts");
    const start = operations.indexOf("async function finalizeFullReturnIfComplete");
    const end = operations.indexOf("async function syncIncompleteReturnStatus");
    const block = operations.slice(start, end);
    assert.doesNotMatch(block, /clearBookingIdPhotos|clearIncompletePhotos|enqueueBlobCleanup/);
    assert.match(block, /collectFullReturnPhotoPaths/);
    assert.match(block, /return paths/);
  });

  it("blob cleanup reschedules still_referenced jobs", () => {
    const blobCleanup = read("src/lib/blobCleanup.ts");
    const start = blobCleanup.indexOf("if (await isBlobPathStillReferenced");
    const block = blobCleanup.slice(start, start + 450);
    assert.match(block, /status:\s*"pending"/);
    assert.doesNotMatch(block, /status:\s*"skipped"/);
    assert.match(block, /30_000/);
  });
});

describe("isBookingFullyReturnedForCleanup (static export)", () => {
  it("exports gate helper without importing server-only module in tests", () => {
    const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");
    assert.match(cleanup, /export async function isBookingFullyReturnedForCleanup/);
  });
});

describe("scheduleBookingPrivateMediaCleanup idempotency (static export)", () => {
  it("exports scheduler via updateMany on ACTIVE rows", () => {
    const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");
    assert.match(cleanup, /export async function scheduleBookingPrivateMediaCleanup/);
    assert.match(cleanup, /status: BOOKING_PRIVATE_MEDIA_STATUS\.ACTIVE/);
  });
});

describe("reactivate pending cleanup on reopen", () => {
  it("exports reactivate helper for non-returned bookings", () => {
    const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");
    assert.match(cleanup, /reactivatePendingPrivateMediaCleanup/);
    assert.match(cleanup, /PENDING_DELETE[\s\S]*ACTIVE/);
  });
});
