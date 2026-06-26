import { mkdir, writeFile } from "fs/promises";
import path from "path";
import QRCode from "qrcode";

export type BookingQrPayload = {
  publicBookingId: string;
  bookingId: number;
  customerName: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  venue?: string;
  totalRent: number;
  advancePaid: number;
  remaining: number;
  dressNames: string[];
  scanUrl?: string;
  billUrl?: string;
};

function appBaseUrl(requestOrigin?: string): string {
  return (
    process.env.BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    requestOrigin?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function qrSaveDir(): string {
  const configured = process.env.QR_SAVE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "public", "qrcodes");
}

/** Human-readable payload encoded in the booking QR PNG. */
export function buildBookingQrContent(payload: BookingQrPayload): string {
  const dresses = payload.dressNames.map((d, i) => `${i + 1}. ${d}`).join("\n");
  const business = process.env.BUSINESS_NAME?.trim() || "Fancy Collection";
  let text =
    `${business}\n` +
    `Booking ID: ${payload.publicBookingId}\n` +
    `Customer: ${payload.customerName}\n` +
    `Delivery: ${payload.deliveryDate} ${payload.deliveryTime}\n` +
    `Return: ${payload.returnDate} ${payload.returnTime}\n`;
  if (payload.venue) text += `Venue: ${payload.venue}\n`;
  text +=
    `\nDresses:\n${dresses}\n` +
    `\nTotal: ₹${payload.totalRent.toLocaleString("en-IN")}\n` +
    `Advance: ₹${payload.advancePaid.toLocaleString("en-IN")}\n` +
    `Balance: ₹${payload.remaining.toLocaleString("en-IN")}\n`;
  if (payload.scanUrl) text += `\nScan: ${payload.scanUrl}\n`;
  if (payload.billUrl) text += `Bill: ${payload.billUrl}\n`;
  return text;
}

/**
 * Generate a PNG QR code for a booking and save it under public/qrcodes/BK-XXXXXX.png.
 * Returns the absolute file path and public URL.
 */
export async function generateBookingQR(
  payload: BookingQrPayload,
  requestOrigin?: string,
): Promise<{ filePath: string; publicUrl: string }> {
  if (!payload.publicBookingId?.trim()) {
    throw new Error("publicBookingId is required to generate booking QR");
  }

  const dir = qrSaveDir();
  await mkdir(dir, { recursive: true });

  const filename = `${payload.publicBookingId}.png`;
  const filePath = path.join(dir, filename);
  const content = buildBookingQrContent(payload);

  await QRCode.toFile(filePath, content, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
    type: "png",
  });

  const base = appBaseUrl(requestOrigin);
  const publicUrl = `${base}/qrcodes/${encodeURIComponent(filename)}`;
  return { filePath, publicUrl };
}

/** Resolve a publicly accessible URL for an existing stored QR path or URL. */
export function resolveQrPublicUrl(qrCodeUrl: string | null | undefined, requestOrigin?: string): string | null {
  if (!qrCodeUrl?.trim()) return null;
  if (qrCodeUrl.startsWith("http")) return qrCodeUrl;
  const base = appBaseUrl(requestOrigin);
  return `${base}${qrCodeUrl.startsWith("/") ? qrCodeUrl : `/${qrCodeUrl}`}`;
}
