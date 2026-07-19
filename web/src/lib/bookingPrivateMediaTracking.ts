import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isPrivateBookingMedia } from "@/lib/storage/privateBookingMedia";
import { isPermanentInventoryMedia } from "@/lib/storage/publicInventoryMedia";
import {
  BOOKING_PRIVATE_MEDIA_STATUS,
  type BookingPrivateMediaType,
} from "@/lib/bookingPrivateMediaTypes";

export function extractBlobPathname(urlOrPath: string): string | null {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return decodeURIComponent(new URL(trimmed).pathname.replace(/^\//, ""));
    }
    return trimmed.replace(/^uploads\//, "").replace(/^\//, "");
  } catch {
    return null;
  }
}

export function shouldTrackBookingPrivateMedia(blobUrl: string | null | undefined): boolean {
  if (!blobUrl?.trim()) return false;
  if (isPermanentInventoryMedia(blobUrl)) return false;
  return isPrivateBookingMedia(blobUrl);
}

type TrackBookingPrivateMediaInput = {
  bookingId: number;
  blobUrl: string;
  mediaType: BookingPrivateMediaType;
  bookingItemId?: number | null;
  bookingOrderId?: number | null;
  tx?: Prisma.TransactionClient;
};

/** Idempotent tracking row for a private booking upload. Skips inventory catalogue refs. */
export async function trackBookingPrivateMedia(input: TrackBookingPrivateMediaInput) {
  const blobUrl = input.blobUrl.trim();
  if (!shouldTrackBookingPrivateMedia(blobUrl)) return null;

  const db = input.tx ?? prisma;
  const existing = await db.bookingPrivateMedia.findFirst({
    where: {
      bookingId: input.bookingId,
      blobUrl,
      status: { not: BOOKING_PRIVATE_MEDIA_STATUS.DELETED },
    },
    select: { id: true },
  });
  if (existing) return existing;

  return db.bookingPrivateMedia.create({
    data: {
      bookingId: input.bookingId,
      bookingItemId: input.bookingItemId ?? null,
      bookingOrderId: input.bookingOrderId ?? null,
      mediaType: input.mediaType,
      blobUrl,
      blobPathname: extractBlobPathname(blobUrl),
      status: BOOKING_PRIVATE_MEDIA_STATUS.ACTIVE,
    },
    select: { id: true },
  });
}

export async function trackBookingPrivateMediaBatch(
  rows: TrackBookingPrivateMediaInput[],
  tx?: Prisma.TransactionClient,
) {
  const created: number[] = [];
  for (const row of rows) {
    const result = await trackBookingPrivateMedia({ ...row, tx });
    if (result) created.push(result.id);
  }
  return created;
}
