import "server-only";

import prisma from "@/lib/prisma";
import { newPublicAccessToken } from "@/lib/publicRateLimit";

const DEFAULT_TTL_DAYS = 90;

/** Ensure booking has a random public slip access token (not BK-######). */
export async function ensurePublicSlipAccess(
  bookingId: number,
  opts?: { ttlDays?: number; renewIfExpired?: boolean },
): Promise<{ token: string; expiresAt: Date }> {
  const ttlDays = opts?.ttlDays ?? DEFAULT_TTL_DAYS;
  const renew = opts?.renewIfExpired !== false;
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { publicAccessToken: true, publicAccessExpiresAt: true },
  });
  if (!row) throw new Error("Booking not found");

  const now = new Date();
  const valid =
    row.publicAccessToken &&
    row.publicAccessToken.length >= 32 &&
    row.publicAccessExpiresAt &&
    row.publicAccessExpiresAt > now;

  if (valid) {
    return { token: row.publicAccessToken!, expiresAt: row.publicAccessExpiresAt! };
  }
  if (!renew && row.publicAccessToken && row.publicAccessExpiresAt && row.publicAccessExpiresAt <= now) {
    throw new Error("Public slip link has expired");
  }

  const token = newPublicAccessToken();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.booking.update({
    where: { id: bookingId },
    data: { publicAccessToken: token, publicAccessExpiresAt: expiresAt },
  });
  return { token, expiresAt };
}

export async function findBookingByPublicSlipToken(token: string): Promise<{ id: number } | null> {
  const clean = token.trim();
  if (!clean || clean.length < 32 || clean.length > 86) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) return null;

  const booking = await prisma.booking.findFirst({
    where: {
      publicAccessToken: clean,
      publicAccessExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return booking;
}

/** Revoke public slip access immediately (clears token + expires link). */
export async function revokePublicSlipAccess(bookingId: number): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      publicAccessToken: null,
      publicAccessExpiresAt: new Date(0),
    },
  });
}

