import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { photoUrl } from "@/lib/photoUrl";
import { ensureBookingQrToken, bookingQrScanUrl } from "@/lib/bookingQr";
import { generateBookingQR, resolveQrPublicUrl } from "@/lib/services/qrcode.service";
import {
  sendAllBookingMessages,
  type BookingConfirmationPayload,
  type DressImagePayload,
  formatAisensyPhone,
  isAisensyConfigured,
} from "@/lib/services/aisensy.service";
import { logWhatsApp } from "@/lib/logger/whatsappLogger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function appBaseUrl(requestOrigin?: string): string {
  return (
    process.env.BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    requestOrigin?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/** Generate a unique public booking ID in BK-XXXXXX format. */
export async function generatePublicBookingId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = String(Math.floor(100000 + Math.random() * 900000));
    const candidate = `BK-${digits}`;
    const existing = await prisma.booking.findUnique({
      where: { publicBookingId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate unique public booking ID");
}

function absoluteMediaUrl(relativeOrAbsolute: string, requestOrigin?: string): string {
  if (!relativeOrAbsolute) return "";
  if (relativeOrAbsolute.startsWith("http") || relativeOrAbsolute.startsWith("data:")) {
    return relativeOrAbsolute;
  }
  const base = appBaseUrl(requestOrigin);
  const path = photoUrl(relativeOrAbsolute);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function buildConfirmationPayload(
  bookingId: number,
  requestOrigin?: string,
): Promise<{ payload: BookingConfirmationPayload; dresses: DressImagePayload[] } | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return null;

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return null;

  const publicBookingId = booking.publicBookingId || (await generatePublicBookingId());
  const qrToken = await ensureBookingQrToken(booking.id);
  const scanUrl = bookingQrScanUrl(qrToken, requestOrigin);
  const billUrl = `${appBaseUrl(requestOrigin)}/booking/${booking.id}/print`;

  let qrCodeUrl = resolveQrPublicUrl(booking.qrCodeUrl, requestOrigin);
  if (!qrCodeUrl) {
    const dressNames = booking.bookingItems.length
      ? booking.bookingItems.map((bi) =>
          dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size),
        )
      : booking.dressName
        ? [booking.dressName]
        : [];

    const generated = await generateBookingQR(
      {
        publicBookingId,
        bookingId: booking.id,
        customerName: booking.customerName,
        deliveryDate: formatDate(booking.deliveryDate, "display"),
        deliveryTime: booking.deliveryTime,
        returnDate: formatDate(booking.returnDate, "display"),
        returnTime: booking.returnTime,
        venue: booking.venue || undefined,
        totalRent: booking.totalPrice,
        advancePaid: booking.totalAdvance,
        remaining: booking.totalRemaining,
        dressNames,
        scanUrl,
        billUrl,
      },
      requestOrigin,
    );
    qrCodeUrl = generated.publicUrl;
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        publicBookingId,
        qrCodeUrl: generated.publicUrl,
        whatsappStatus: booking.whatsappStatus || "pending",
      },
    });
  } else if (!booking.publicBookingId) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { publicBookingId, whatsappStatus: booking.whatsappStatus || "pending" },
    });
  }

  const dressNames = booking.bookingItems.length
    ? booking.bookingItems.map((bi) =>
        dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size),
      )
    : booking.dressName
      ? [booking.dressName]
      : [];

  const dresses: DressImagePayload[] = booking.bookingItems.map((bi) => ({
    dressName: dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size),
    imageUrl: bi.item?.photo ? absoluteMediaUrl(bi.item.photo, requestOrigin) : "",
    size: bi.size || bi.item?.size,
    color: bi.item?.color,
    rentalPrice: bi.price,
  }));

  const payload: BookingConfirmationPayload = {
    bookingId: booking.id,
    publicBookingId,
    phone: phoneRaw.trim(),
    customerName: booking.customerName,
    serialNo: booking.monthlySerial,
    deliveryDate: formatDate(booking.deliveryDate, "display"),
    deliveryTime: booking.deliveryTime,
    returnDate: formatDate(booking.returnDate, "display"),
    returnTime: booking.returnTime,
    venue: booking.venue || undefined,
    totalRent: booking.totalPrice,
    advancePaid: booking.totalAdvance,
    remaining: booking.totalRemaining,
    dressNames,
    qrCodeUrl: qrCodeUrl || undefined,
    billUrl,
  };

  return { payload, dresses };
}

/** Enqueue failed WhatsApp steps for later retry. */
export async function enqueueWhatsAppRetry(
  bookingId: number,
  step: string,
  stepIndex: number,
  payload: unknown,
  error: string,
): Promise<void> {
  const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
  await prisma.whatsAppMessageQueue.create({
    data: {
      bookingId,
      step,
      stepIndex,
      payload: JSON.stringify(payload),
      status: "pending",
      lastError: error,
      nextRetryAt,
    },
  });
}

/** Process pending WhatsApp retry queue entries (for cron). */
export async function processWhatsAppRetryQueue(limit = 20): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const rows = await prisma.whatsAppMessageQueue.findMany({
    where: {
      status: "pending",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      attempts: { lt: 5 },
    },
    orderBy: [{ nextRetryAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.payload) as {
        bookingId: number;
        requestOrigin?: string;
        step?: string;
        dress?: DressImagePayload;
      };

      const built = await buildConfirmationPayload(parsed.bookingId, parsed.requestOrigin);
      if (!built) {
        await prisma.whatsAppMessageQueue.update({
          where: { id: row.id },
          data: { status: "failed", lastError: "Booking or phone not found", attempts: { increment: 1 } },
        });
        failed++;
        continue;
      }

      const { sendBookingConfirmationText, sendQRCodeImage, sendAisensyMessage } = await import(
        "@/lib/services/aisensy.service"
      );

      let result: { ok: boolean; error?: string; skipped?: boolean } = { ok: false, error: "Unknown step" };

      if (row.step === "confirmation_text") {
        result = await sendBookingConfirmationText(built.payload);
      } else if (row.step === "qr_image") {
        result = await sendQRCodeImage(built.payload);
      } else if (row.step === "dress_image" && parsed.dress) {
        const campaign =
          process.env.AISENSY_CAMPAIGN_BOOKING_IMAGE?.trim() ||
          process.env.AISENSY_CAMPAIGN_BOOKING?.trim() ||
          process.env.AISENSY_CAMPAIGN_DEFAULT?.trim();
        if (!campaign) {
          result = { ok: false, error: "Dress campaign not configured", skipped: true };
        } else {
          result = await sendAisensyMessage({
            campaignName: campaign,
            phone: built.payload.phone,
            userName: built.payload.customerName,
            mediaUrl: parsed.dress.imageUrl,
            mediaFilename: `${parsed.dress.dressName.replace(/\s+/g, "-")}.jpg`,
            templateParams: [parsed.dress.dressName],
            source: `booking-dress-retry-${parsed.bookingId}`,
            bookingId: parsed.bookingId,
            publicBookingId: built.payload.publicBookingId,
            step: "dress_image",
          });
        }
      }

      if (result.ok || result.skipped) {
        await prisma.whatsAppMessageQueue.update({
          where: { id: row.id },
          data: { status: "sent", attempts: { increment: 1 } },
        });
        sent++;
      } else {
        const attempts = row.attempts + 1;
        await prisma.whatsAppMessageQueue.update({
          where: { id: row.id },
          data: {
            status: attempts >= row.maxAttempts ? "failed" : "pending",
            attempts,
            lastError: result.error,
            nextRetryAt: new Date(Date.now() + attempts * 5 * 60 * 1000),
          },
        });
        failed++;
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Retry failed";
      await prisma.whatsAppMessageQueue.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: error,
          nextRetryAt: new Date(Date.now() + (row.attempts + 1) * 5 * 60 * 1000),
        },
      });
      failed++;
    }
  }

  return { processed: rows.length, sent, failed };
}

/**
 * Prepare booking (public ID + QR file) and send all WhatsApp messages.
 * Never throws — failures are logged and persisted on the booking row.
 */
export async function runBookingWhatsAppFlow(
  bookingId: number,
  requestOrigin?: string,
  opts?: { force?: boolean },
): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  if (!isAisensyConfigured()) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { whatsappStatus: "skipped", whatsappError: "AiSensy not configured" },
    });
    return { status: "skipped", error: "AiSensy not configured" };
  }

  try {
    const built = await buildConfirmationPayload(bookingId, requestOrigin);
    if (!built) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { whatsappStatus: "skipped", whatsappError: "No WhatsApp number" },
      });
      return { status: "skipped", error: "No WhatsApp number" };
    }

    const phone = formatAisensyPhone(built.payload.phone);
    if (!phone) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { whatsappStatus: "failed", whatsappError: "Invalid phone number" },
      });
      return { status: "failed", error: "Invalid phone number" };
    }

    if (!opts?.force) {
      const existing = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { whatsappStatus: true },
      });
      if (existing?.whatsappStatus === "sent") {
        return { status: "sent" };
      }
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { whatsappStatus: "pending", whatsappError: null },
    });

    await logWhatsApp({
      bookingId,
      publicBookingId: built.payload.publicBookingId,
      step: "flow_start",
      phone,
      success: true,
    });

    const result = await sendAllBookingMessages(built.payload, built.dresses);

    if (result.ok) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          whatsappStatus: "sent",
          whatsappSentAt: new Date(),
          whatsappError: null,
        },
      });
      return { status: "sent" };
    }

    for (const err of result.errors) {
      if (err.startsWith("Text:")) {
        await enqueueWhatsAppRetry(bookingId, "confirmation_text", 0, { bookingId, requestOrigin }, err);
      } else if (err.startsWith("QR:")) {
        await enqueueWhatsAppRetry(bookingId, "qr_image", 1, { bookingId, requestOrigin }, err);
      } else {
        const dress = built.dresses.find((d) => err.startsWith(d.dressName));
        if (dress) {
          await enqueueWhatsAppRetry(
            bookingId,
            "dress_image",
            2,
            { bookingId, requestOrigin, dress },
            err,
          );
        }
      }
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        whatsappStatus: "failed",
        whatsappError: result.errors.join("; ").slice(0, 2000),
      },
    });

    return { status: "failed", error: result.errors.join("; ") };
  } catch (e) {
    const error = e instanceof Error ? e.message : "WhatsApp flow failed";
    await logWhatsApp({ bookingId, step: "flow_error", success: false, error });
    await prisma.booking
      .update({
        where: { id: bookingId },
        data: { whatsappStatus: "failed", whatsappError: error },
      })
      .catch(() => undefined);
    return { status: "failed", error };
  }
}

/** Fire-and-forget wrapper — must not block booking save. */
export function triggerBookingWhatsAppAsync(bookingId: number, requestOrigin?: string): void {
  void runBookingWhatsAppFlow(bookingId, requestOrigin).catch((e) => {
    console.error("[bookingWhatsApp] async flow failed:", e);
  });
}

/** Whether WhatsApp should be sent on booking update (phone changed). */
export function shouldResendWhatsAppOnUpdate(
  oldWhatsapp: string | null | undefined,
  oldContact: string | null | undefined,
  newWhatsapp: string,
  newContact: string,
): boolean {
  const oldPhone = (oldWhatsapp || oldContact || "").replace(/\D/g, "");
  const newPhone = (newWhatsapp || newContact || "").replace(/\D/g, "");
  return oldPhone !== newPhone && newPhone.length >= 10;
}

export { sleep };
