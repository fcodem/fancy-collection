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

export async function backfillMissingQrTokens(limit = 500) {
  const rows = await prisma.booking.findMany({
    where: { qrToken: null },
    select: { id: true },
    take: limit,
  });
  for (const row of rows) {
    await ensureBookingQrToken(row.id);
  }
  return rows.length;
}

// Re-export client parser types for server routes that need them
export type { ParsedQrScan } from "./bookingQrClient";
export { parseQrScanPayload, bookingQrNavigatePath } from "./bookingQrClient";
