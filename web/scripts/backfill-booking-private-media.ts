import prisma from "../src/lib/prisma";
import {
  extractBlobPathname,
  shouldTrackBookingPrivateMedia,
  trackBookingPrivateMedia,
} from "../src/lib/bookingPrivateMediaTracking";
import { BOOKING_PRIVATE_MEDIA_TYPES } from "../src/lib/bookingPrivateMediaTypes";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run");

try {
  if (apply === dryRun) {
    console.error(
      "Choose exactly one mode: npm run backfill:booking-private-media -- --dry-run OR --apply",
    );
    process.exitCode = 2;
  } else {
    await run();
  }
} finally {
  await prisma.$disconnect();
}

type Candidate = {
  bookingId: number;
  blobUrl: string;
  mediaType: (typeof BOOKING_PRIVATE_MEDIA_TYPES)[keyof typeof BOOKING_PRIVATE_MEDIA_TYPES];
  bookingItemId?: number;
  bookingOrderId?: number;
  source: string;
};

async function run() {
  const candidates: Candidate[] = [];
  const ambiguous: string[] = [];
  let skippedInventoryCount = 0;

  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      idPhoto1: true,
      idPhoto2: true,
      incompletePhoto: true,
      bookingItems: { select: { id: true, itemIncompletePhoto: true } },
      orders: { select: { id: true, photo: true } },
      selectedJewellery: { select: { id: true, photo: true, source: true, itemId: true } },
    },
    orderBy: { id: "asc" },
  });

  for (const booking of bookings) {
    const push = (row: Omit<Candidate, "bookingId">) => {
      if (!shouldTrackBookingPrivateMedia(row.blobUrl)) {
        if (row.blobUrl.trim()) skippedInventoryCount += 1;
        return;
      }
      candidates.push({ bookingId: booking.id, ...row });
    };

    if (booking.idPhoto1) {
      push({
        blobUrl: booking.idPhoto1,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ID_PROOF,
        source: "booking.idPhoto1",
      });
    }
    if (booking.idPhoto2) {
      push({
        blobUrl: booking.idPhoto2,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ID_PROOF,
        source: "booking.idPhoto2",
      });
    }
    if (booking.incompletePhoto) {
      push({
        blobUrl: booking.incompletePhoto,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.INCOMPLETE_RETURN,
        source: "booking.incompletePhoto",
      });
    }

    for (const item of booking.bookingItems) {
      if (!item.itemIncompletePhoto) continue;
      push({
        blobUrl: item.itemIncompletePhoto,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.INCOMPLETE_RETURN,
        bookingItemId: item.id,
        source: `bookingItem#${item.id}.itemIncompletePhoto`,
      });
    }

    for (const order of booking.orders) {
      if (!order.photo) continue;
      push({
        blobUrl: order.photo,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.ORDER_PHOTO,
        bookingOrderId: order.id,
        source: `bookingOrder#${order.id}.photo`,
      });
    }

    for (const jewellery of booking.selectedJewellery) {
      if (!jewellery.photo) continue;
      if (jewellery.source !== "manual" && jewellery.itemId) {
        ambiguous.push(
          `booking ${booking.id} jewellery#${jewellery.id}: inventory-linked photo (${jewellery.photo.slice(0, 80)})`,
        );
        continue;
      }
      push({
        blobUrl: jewellery.photo,
        mediaType: BOOKING_PRIVATE_MEDIA_TYPES.JEWELLERY_SELECTION,
        source: `bookingJewellery#${jewellery.id}.photo`,
      });
    }
  }

  const existing = await prisma.bookingPrivateMedia.findMany({
    select: { bookingId: true, blobUrl: true },
  });
  const existingKeys = new Set(existing.map((row) => `${row.bookingId}::${row.blobUrl}`));

  const toCreate = candidates.filter((c) => !existingKeys.has(`${c.bookingId}::${c.blobUrl}`));

  console.log(`${dryRun ? "DRY RUN" : "APPLY"} booking private media backfill`);
  console.log(`Candidates (private): ${candidates.length}`);
  console.log(`Already tracked: ${candidates.length - toCreate.length}`);
  console.log(`Would create: ${toCreate.length}`);
  console.log(`Skipped inventory/public refs: ${skippedInventoryCount}`);
  console.log(`Ambiguous (reported, not created): ${ambiguous.length}`);

  for (const row of toCreate.slice(0, 25)) {
    console.log(
      `  booking ${row.bookingId} ${row.source} -> ${row.mediaType} ${extractBlobPathname(row.blobUrl) ?? row.blobUrl.slice(0, 60)}`,
    );
  }
  if (toCreate.length > 25) console.log(`  ...and ${toCreate.length - 25} more.`);

  for (const line of ambiguous.slice(0, 10)) console.log(`  AMBIGUOUS: ${line}`);
  if (ambiguous.length > 10) console.log(`  ...and ${ambiguous.length - 10} more ambiguous.`);

  if (dryRun) {
    console.log("Dry run complete. No database writes were performed.");
    return;
  }

  let created = 0;
  for (const row of toCreate) {
    const result = await trackBookingPrivateMedia({
      bookingId: row.bookingId,
      blobUrl: row.blobUrl,
      mediaType: row.mediaType,
      bookingItemId: row.bookingItemId,
      bookingOrderId: row.bookingOrderId,
    });
    if (result) created += 1;
  }
  console.log(`Created ${created} booking_private_media row(s).`);
}
