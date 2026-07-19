import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { deletePrivateBookingMedia } from "@/lib/storage/privateBookingMedia";
import {
  isPermanentInventoryMedia,
  REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
} from "@/lib/storage/publicInventoryMedia";
import { isPrivateBookingMedia } from "@/lib/storage/privateBookingMedia";
import {
  BOOKING_PRIVATE_MEDIA_STATUS,
  type BookingPrivateMediaStatus,
} from "@/lib/bookingPrivateMediaTypes";

const MAX_DELETE_ATTEMPTS = 5;

/** No dispute/hold field exists on Booking today — documented skip. */
export type FullReturnCleanupGate = {
  ok: boolean;
  reason?:
    | "not_found"
    | "not_returned"
    | "partial_return"
    | "incomplete_return"
    | "undelivered_items";
};

export async function isBookingFullyReturnedForCleanup(
  bookingId: number,
  client?: Prisma.TransactionClient,
): Promise<FullReturnCleanupGate> {
  const db = client ?? prisma;
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: true },
  });
  if (!booking) return { ok: false, reason: "not_found" };
  if (booking.status !== "returned") return { ok: false, reason: "not_returned" };

  const active = booking.bookingItems.filter((bi) => !bi.isCancelled);
  const delivered = active.filter((bi) => bi.isDelivered);

  if (active.length > 0) {
    const undelivered = active.filter((bi) => !bi.isDelivered);
    if (undelivered.length > 0) return { ok: false, reason: "undelivered_items" };
    if (delivered.some((bi) => !bi.isReturned)) return { ok: false, reason: "partial_return" };
    if (delivered.some((bi) => bi.isIncompleteReturn)) {
      return { ok: false, reason: "incomplete_return" };
    }
  }

  return { ok: true };
}

/** After a successful full return commit, mark active private-media rows for deletion. */
export async function scheduleBookingPrivateMediaCleanup(
  bookingId: number,
): Promise<{ scheduled: number; skipped: boolean; reason?: string }> {
  const gate = await isBookingFullyReturnedForCleanup(bookingId);
  if (!gate.ok) {
    return { scheduled: 0, skipped: true, reason: gate.reason };
  }

  const now = new Date();
  const result = await prisma.bookingPrivateMedia.updateMany({
    where: {
      bookingId,
      status: BOOKING_PRIVATE_MEDIA_STATUS.ACTIVE,
    },
    data: {
      status: BOOKING_PRIVATE_MEDIA_STATUS.PENDING_DELETE,
      deleteAfter: now,
      deleteAttempts: 0,
      lastErrorCode: null,
    },
  });

  return { scheduled: result.count, skipped: false };
}

/** If a booking is reopened from returned, cancel pending deletes. */
export async function reactivatePendingPrivateMediaCleanup(bookingId: number): Promise<number> {
  const gate = await isBookingFullyReturnedForCleanup(bookingId);
  if (gate.ok) return 0;

  const result = await prisma.bookingPrivateMedia.updateMany({
    where: {
      bookingId,
      status: BOOKING_PRIVATE_MEDIA_STATUS.PENDING_DELETE,
    },
    data: {
      status: BOOKING_PRIVATE_MEDIA_STATUS.ACTIVE,
      deleteAfter: null,
      deleteAttempts: 0,
      lastErrorCode: null,
    },
  });
  return result.count;
}

async function clearExactLegacyReference(
  bookingId: number,
  blobUrl: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      idPhoto1: true,
      idPhoto2: true,
      incompletePhoto: true,
    },
  });
  if (booking) {
    const data: Prisma.BookingUpdateInput = {};
    if (booking.idPhoto1 === blobUrl) data.idPhoto1 = null;
    if (booking.idPhoto2 === blobUrl) data.idPhoto2 = null;
    if (booking.incompletePhoto === blobUrl) data.incompletePhoto = null;
    if (Object.keys(data).length) {
      await tx.booking.update({ where: { id: bookingId }, data });
    }
  }

  await tx.bookingItem.updateMany({
    where: { bookingId, itemIncompletePhoto: blobUrl },
    data: { itemIncompletePhoto: null },
  });

  await tx.bookingOrder.updateMany({
    where: { bookingId, photo: blobUrl },
    data: { photo: null },
  });

  await tx.bookingJewellery.updateMany({
    where: { bookingId, photo: blobUrl, source: "manual" },
    data: { photo: null },
  });
}

async function markDeleteOutcome(
  id: number,
  data: {
    status: BookingPrivateMediaStatus;
    deleteAttempts: number;
    lastErrorCode?: string | null;
    deleteAfter?: Date | null;
    deletedAt?: Date | null;
  },
) {
  await prisma.bookingPrivateMedia.update({
    where: { id },
    data,
  });
}

export async function processPendingPrivateMediaCleanup(limit = 20) {
  const now = new Date();
  let records: Awaited<ReturnType<typeof prisma.bookingPrivateMedia.findMany>> = [];
  try {
    records = await prisma.bookingPrivateMedia.findMany({
      where: {
        status: BOOKING_PRIVATE_MEDIA_STATUS.PENDING_DELETE,
        OR: [{ deleteAfter: null }, { deleteAfter: { lte: now } }],
      },
      orderBy: [{ deleteAfter: "asc" }, { id: "asc" }],
      take: limit,
    });
  } catch {
    return { processed: 0, deleted: 0, failed: 0, reactivated: 0, retried: 0 };
  }

  let deleted = 0;
  let failed = 0;
  let reactivated = 0;
  let retried = 0;

  for (const record of records) {
    const gate = await isBookingFullyReturnedForCleanup(record.bookingId);
    if (!gate.ok) {
      await markDeleteOutcome(record.id, {
        status: BOOKING_PRIVATE_MEDIA_STATUS.ACTIVE,
        deleteAttempts: 0,
        lastErrorCode: null,
        deleteAfter: null,
        deletedAt: null,
      });
      reactivated += 1;
      continue;
    }

    if (isPermanentInventoryMedia(record.blobUrl)) {
      await markDeleteOutcome(record.id, {
        status: BOOKING_PRIVATE_MEDIA_STATUS.DELETE_FAILED,
        deleteAttempts: record.deleteAttempts + 1,
        lastErrorCode: REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
        deleteAfter: null,
      });
      failed += 1;
      continue;
    }

    if (!isPrivateBookingMedia(record.blobUrl)) {
      await markDeleteOutcome(record.id, {
        status: BOOKING_PRIVATE_MEDIA_STATUS.DELETE_FAILED,
        deleteAttempts: record.deleteAttempts + 1,
        lastErrorCode: "NOT_PRIVATE_BOOKING_MEDIA",
        deleteAfter: null,
      });
      failed += 1;
      continue;
    }

    try {
      await deletePrivateBookingMedia(record.blobUrl);
      await prisma.$transaction(async (tx) => {
        await clearExactLegacyReference(record.bookingId, record.blobUrl, tx);
      });
      await markDeleteOutcome(record.id, {
        status: BOOKING_PRIVATE_MEDIA_STATUS.DELETED,
        deleteAttempts: record.deleteAttempts + 1,
        lastErrorCode: null,
        deleteAfter: null,
        deletedAt: new Date(),
      });
      deleted += 1;
    } catch {
      const attempts = record.deleteAttempts + 1;
      if (attempts >= MAX_DELETE_ATTEMPTS) {
        await markDeleteOutcome(record.id, {
          status: BOOKING_PRIVATE_MEDIA_STATUS.DELETE_FAILED,
          deleteAttempts: attempts,
          lastErrorCode: "DELETE_FAILED",
          deleteAfter: null,
        });
        failed += 1;
      } else {
        await markDeleteOutcome(record.id, {
          status: BOOKING_PRIVATE_MEDIA_STATUS.PENDING_DELETE,
          deleteAttempts: attempts,
          lastErrorCode: "DELETE_RETRY",
          deleteAfter: new Date(Date.now() + Math.min(30, attempts) * 60_000),
        });
        retried += 1;
      }
    }
  }

  return {
    processed: records.length,
    deleted,
    failed,
    reactivated,
    retried,
  };
}
