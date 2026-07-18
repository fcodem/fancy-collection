import { createHmac, timingSafeEqual } from "crypto";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import prisma from "./prisma";

export function generateBookingQrToken() {
  return randomUUID();
}

function qrSigningSecret() {
  const secret =
    process.env.QR_SIGNING_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("QR_SIGNING_SECRET or SESSION_SECRET (32+) required in production.");
  }
  return "dev-only-change-qr-secret-in-production!!";
}

/** HMAC signature — QR only valid when opened through this app with matching ?s= */
export function signBookingQrToken(qrToken: string): string {
  return createHmac("sha256", qrSigningSecret()).update(qrToken).digest("base64url");
}

export function verifyBookingQrSignature(qrToken: string, signature: string | null | undefined): boolean {
  if (!signature?.trim()) return false;
  const expected = signBookingQrToken(qrToken);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return signature === expected;
  }
}

/** Signed URL encoded in bill QR — only this site can verify ?s= */
export function bookingQrScanUrl(qrToken: string, requestOrigin?: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    requestOrigin?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const sig = signBookingQrToken(qrToken);
  return `${base}/booking/qr/${encodeURIComponent(qrToken)}?s=${encodeURIComponent(sig)}`;
}

/** Where to send staff after scanning — always open the booking panel for that booking. */
export function bookingQrTargetPath(_status: string, bookingId: number): string {
  return `/booking/${bookingId}`;
}

export async function ensureBookingQrToken(bookingId: number): Promise<string> {
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { qrToken: true },
  });
  if (existing?.qrToken) return existing.qrToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateBookingQrToken();
    try {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { qrToken: token },
      });
      return token;
    } catch {
      const row = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { qrToken: true },
      });
      if (row?.qrToken) return row.qrToken;
    }
  }
  throw new Error("Could not assign QR token");
}

export async function findBookingByQrToken(qrToken: string) {
  const clean = qrToken.trim();
  let booking = await prisma.booking.findUnique({
    where: { qrToken: clean },
    select: { id: true, status: true, qrToken: true, monthlySerial: true, customerName: true },
  });
  if (booking) return booking;

  const pathMatch = clean.match(/\/booking\/qr\/([^/\s?#]+)/);
  const extracted = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : clean;
  if (extracted !== clean) {
    booking = await prisma.booking.findUnique({
      where: { qrToken: extracted },
      select: { id: true, status: true, qrToken: true, monthlySerial: true, customerName: true },
    });
  }
  return booking;
}

export async function bookingQrDataUrl(
  qrToken: string,
  requestOrigin?: string,
  width = 160,
) {
  const url = bookingQrScanUrl(qrToken, requestOrigin);
  return QRCode.toDataURL(url, { width, margin: 1, errorCorrectionLevel: "M" });
}

/** How many historical bookings still have no QR token (for reporting). */
export async function countBookingsMissingQrToken(): Promise<number> {
  return prisma.booking.count({ where: { qrToken: null } });
}

/**
 * Verify the fast set-based path is available on THIS database BEFORE a real run,
 * so we never discover a missing `gen_random_uuid()` via a failed production
 * backfill. Read-only: it generates one uuid and discards it. Returns whether
 * the fast path works and which strategy the backfill will use.
 */
export async function qrBackfillPreflight(): Promise<{
  genRandomUuid: boolean;
  strategy: "set-based" | "per-row-fallback";
  detail?: string;
}> {
  try {
    const { Prisma } = await import("@prisma/client");
    await prisma.$queryRaw(Prisma.sql`SELECT gen_random_uuid()`);
    return { genRandomUuid: true, strategy: "set-based" };
  } catch (e) {
    return {
      genRandomUuid: false,
      strategy: "per-row-fallback",
      detail:
        e instanceof Error ? e.message : "gen_random_uuid() unavailable on this database",
    };
  }
}

/**
 * Assign QR tokens to a bounded batch of historical bookings.
 * Set-based UPDATE (one statement) with a per-row fallback for engines without
 * gen_random_uuid(). NEVER call this during a scan/navigation request — it is for
 * an explicit admin action or scheduled maintenance only. Resumable: call
 * repeatedly until it returns 0.
 */
export async function backfillMissingQrTokens(limit = 500): Promise<number> {
  const batch = Math.max(1, Math.min(limit, 1000));
  const rows = await prisma.booking.findMany({
    where: { qrToken: null },
    select: { id: true },
    take: batch,
  });
  if (!rows.length) return 0;

  const ids = rows.map((r) => r.id);
  try {
    const { Prisma } = await import("@prisma/client");
    await prisma.$executeRaw(
      Prisma.sql`UPDATE bookings SET qr_token = gen_random_uuid()::text WHERE id IN (${Prisma.join(
        ids,
      )}) AND qr_token IS NULL`,
    );
    return ids.length;
  } catch {
    // Fallback (e.g. non-Postgres / missing gen_random_uuid): idempotent per-row.
    let done = 0;
    for (const id of ids) {
      await ensureBookingQrToken(id);
      done += 1;
    }
    return done;
  }
}

/**
 * Drain the backfill in bounded batches until complete or a cap is reached.
 * Returns processed count and remaining count for reporting.
 */
export async function runQrBackfill(opts?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<{ processed: number; remaining: number; batches: number }> {
  const batchSize = opts?.batchSize ?? 500;
  const maxBatches = opts?.maxBatches ?? 40;
  let processed = 0;
  let batches = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await backfillMissingQrTokens(batchSize);
    if (n === 0) break;
    processed += n;
    batches += 1;
  }
  const remaining = await countBookingsMissingQrToken();
  return { processed, remaining, batches };
}

// Re-export client parser types for server routes that need them
export type { ParsedQrScan } from "./bookingQrClient";
export { parseQrScanPayload, bookingQrNavigatePath } from "./bookingQrClient";
