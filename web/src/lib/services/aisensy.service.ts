import { aisensyCsvPhone } from "@/lib/phone";
import { logWhatsApp } from "@/lib/logger/whatsappLogger";

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export type AisensySendResult =
  | { ok: true; messageId?: string; raw?: unknown }
  | { ok: false; error: string; skipped?: boolean };

export type DressImagePayload = {
  dressName: string;
  imageUrl: string;
  size?: string | null;
  color?: string | null;
  rentalPrice?: number;
};

export type BookingConfirmationPayload = {
  bookingId: number;
  publicBookingId: string;
  phone: string;
  customerName: string;
  serialNo: number;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  venue?: string;
  totalRent: number;
  advancePaid: number;
  remaining: number;
  dressNames: string[];
  qrCodeUrl?: string;
  billUrl?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Validate and format phone as 91XXXXXXXXXX (no +, no spaces). */
export function formatAisensyPhone(phone: string): string | null {
  return aisensyCsvPhone(phone);
}

export function isAisensyConfigured(): boolean {
  return Boolean(process.env.AISENSY_API_KEY?.trim());
}

function campaignName(type: "booking" | "qr" | "dress" | "default"): string | undefined {
  const map: Record<string, string | undefined> = {
    booking: process.env.AISENSY_CAMPAIGN_BOOKING,
    qr: process.env.AISENSY_CAMPAIGN_BOOKING_QR || process.env.AISENSY_CAMPAIGN_BOOKING,
    dress: process.env.AISENSY_CAMPAIGN_BOOKING_IMAGE || process.env.AISENSY_CAMPAIGN_BOOKING,
    default: process.env.AISENSY_CAMPAIGN_DEFAULT,
  };
  return map[type]?.trim() || map.default?.trim() || undefined;
}

function businessFooter(): string {
  const name = process.env.BUSINESS_NAME?.trim() || "FANCY COLLECTION BY RENU AGARWAL";
  const phone = process.env.BUSINESS_PHONE?.trim() || "8630834711, 8077843874";
  return `\n✨ *${name}*\nRENT | WEAR | RETURN\n📞 ${phone}`;
}

/** Build the full booking confirmation text including bill summary and terms. */
export function buildFullBookingConfirmationText(payload: BookingConfirmationPayload): string {
  const serial = String(payload.serialNo).padStart(2, "0");
  const dresses = payload.dressNames.map((d, i) => `${i + 1}. ${d}`).join("\n");

  let msg =
    `🙏 *Thank you for choosing ${process.env.BUSINESS_NAME?.trim() || "Fancy Collection"}!*\n\n` +
    `Dear *${payload.customerName}*, your booking is confirmed.\n\n` +
    `🆔 Booking ID: *${payload.publicBookingId}*\n\n` +
    `📋 *Booking Bill*\n` +
    `Serial #: *${serial}*\n` +
    `📅 Delivery: *${payload.deliveryDate}* (${payload.deliveryTime})\n` +
    `📅 Return: *${payload.returnDate}* (${payload.returnTime})\n` +
    (payload.venue ? `📍 Venue: *${payload.venue}*\n` : "") +
    `\n👗 *Your Dresses:*\n${dresses}\n\n` +
    `💰 Total Rent: ₹${payload.totalRent.toLocaleString("en-IN")}\n` +
    `✅ Advance Paid: ₹${payload.advancePaid.toLocaleString("en-IN")}\n` +
    `📌 Balance Due: ₹${payload.remaining.toLocaleString("en-IN")}\n`;

  if (payload.billUrl) msg += `\n🧾 View Bill: ${payload.billUrl}\n`;
  if (payload.qrCodeUrl) msg += `\n📱 Booking QR: ${payload.qrCodeUrl}\n`;

  msg +=
    `\n📜 *Terms & Conditions:*\n` +
    `• Please return all items on time in good condition.\n` +
    `• Late returns may incur additional charges.\n` +
    `• Security deposit is refundable after inspection.\n` +
    `• Any damage or stain may be deducted from deposit.\n` +
    `• Balance payment is due at delivery unless agreed otherwise.\n` +
    `• Carry this booking ID / QR at pickup.\n`;

  msg += businessFooter();
  return msg;
}

/** Template params for AiSensy booking_confirmation campaign ({{1}}..{{10}}). */
export function bookingConfirmationTemplateParams(payload: BookingConfirmationPayload): string[] {
  const serial = String(payload.serialNo).padStart(2, "0");
  return [
    payload.customerName,
    serial,
    `${payload.deliveryDate} (${payload.deliveryTime})`,
    `${payload.returnDate} (${payload.returnTime})`,
    payload.dressNames.join(", "),
    payload.totalRent.toLocaleString("en-IN"),
    payload.advancePaid.toLocaleString("en-IN"),
    payload.remaining.toLocaleString("en-IN"),
    payload.venue || "-",
    payload.billUrl || "-",
  ];
}

async function postAisensy(
  body: Record<string, unknown>,
  meta: { bookingId: number | string; publicBookingId?: string; step: string; phone: string; campaign?: string },
): Promise<AisensySendResult> {
  try {
    const res = await fetch(AISENSY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      success?: boolean;
      id?: string;
      messageId?: string;
    };

    const ok = res.ok && raw.success !== false;
    const messageId = raw.messageId || raw.id;

    await logWhatsApp({
      bookingId: meta.bookingId,
      publicBookingId: meta.publicBookingId,
      step: meta.step,
      phone: meta.phone,
      campaign: meta.campaign,
      success: ok,
      messageId,
      error: ok ? undefined : raw.message || raw.error || `HTTP ${res.status}`,
      detail: raw,
    });

    if (!ok) {
      return { ok: false, error: raw.message || raw.error || `AiSensy HTTP ${res.status}` };
    }
    return { ok: true, messageId, raw };
  } catch (e) {
    const error = e instanceof Error ? e.message : "AiSensy request failed";
    await logWhatsApp({
      bookingId: meta.bookingId,
      publicBookingId: meta.publicBookingId,
      step: meta.step,
      phone: meta.phone,
      campaign: meta.campaign,
      success: false,
      error,
    });
    return { ok: false, error };
  }
}

/**
 * Low-level AiSensy send with optional media and template params.
 * Phone must be valid Indian mobile (validated before call).
 */
export async function sendAisensyMessage(opts: {
  campaignName: string;
  phone: string;
  userName: string;
  templateParams?: string[];
  mediaUrl?: string;
  mediaFilename?: string;
  source?: string;
  tags?: string[];
  bookingId: number | string;
  publicBookingId?: string;
  step: string;
}): Promise<AisensySendResult> {
  const apiKey = process.env.AISENSY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "AiSensy API key is not configured.", skipped: true };
  }

  const destination = formatAisensyPhone(opts.phone);
  if (!destination) {
    return { ok: false, error: `Invalid phone number: ${opts.phone}` };
  }

  const body: Record<string, unknown> = {
    apiKey,
    campaignName: opts.campaignName,
    destination,
    userName: opts.userName || "Customer",
    source: opts.source || process.env.AISENSY_SOURCE || "fancy-collection-web",
  };

  if (opts.templateParams?.length) body.templateParams = opts.templateParams;
  if (opts.tags?.length) body.tags = opts.tags;
  if (opts.mediaUrl) {
    body.media = {
      url: opts.mediaUrl,
      filename: opts.mediaFilename || "image.png",
    };
  }

  return postAisensy(body, {
    bookingId: opts.bookingId,
    publicBookingId: opts.publicBookingId,
    step: opts.step,
    phone: destination,
    campaign: opts.campaignName,
  });
}

/**
 * Send the booking confirmation text message via AiSensy template campaign.
 */
export async function sendBookingConfirmationText(
  payload: BookingConfirmationPayload,
): Promise<AisensySendResult> {
  const campaign = campaignName("booking");
  if (!campaign) {
    return { ok: false, error: "AISENSY_CAMPAIGN_BOOKING is not configured.", skipped: true };
  }

  return sendAisensyMessage({
    campaignName: campaign,
    phone: payload.phone,
    userName: payload.customerName,
    templateParams: bookingConfirmationTemplateParams(payload),
    source: `booking-text-${payload.bookingId}`,
    bookingId: payload.bookingId,
    publicBookingId: payload.publicBookingId,
    step: "confirmation_text",
  });
}

/**
 * Send the booking QR code image via AiSensy media campaign.
 */
export async function sendQRCodeImage(
  payload: BookingConfirmationPayload,
): Promise<AisensySendResult> {
  if (!payload.qrCodeUrl?.trim()) {
    return { ok: false, error: "No QR code URL available for this booking." };
  }

  const campaign = campaignName("qr");
  if (!campaign) {
    return { ok: false, error: "QR WhatsApp campaign is not configured.", skipped: true };
  }

  return sendAisensyMessage({
    campaignName: campaign,
    phone: payload.phone,
    userName: payload.customerName,
    mediaUrl: payload.qrCodeUrl,
    mediaFilename: `${payload.publicBookingId}.png`,
    templateParams: [payload.customerName, payload.publicBookingId],
    source: `booking-qr-${payload.bookingId}`,
    bookingId: payload.bookingId,
    publicBookingId: payload.publicBookingId,
    step: "qr_image",
  });
}

/**
 * Send each booked dress image with a 1 second delay between messages.
 */
export async function sendDressImages(
  payload: BookingConfirmationPayload,
  dresses: DressImagePayload[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const campaign = campaignName("dress");
  if (!campaign) {
    return { sent: 0, failed: dresses.length, errors: ["Dress image WhatsApp campaign is not configured."] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < dresses.length; i++) {
    if (i > 0) await sleep(1000);

    const dress = dresses[i];
    if (!dress.imageUrl?.trim()) {
      failed++;
      errors.push(`${dress.dressName}: no image URL`);
      continue;
    }

    const captionParts = [dress.dressName];
    if (dress.size) captionParts.push(`Size: ${dress.size}`);
    if (dress.color) captionParts.push(`Color: ${dress.color}`);
    if (dress.rentalPrice != null) captionParts.push(`Rent: ₹${dress.rentalPrice.toLocaleString("en-IN")}`);

    const result = await sendAisensyMessage({
      campaignName: campaign,
      phone: payload.phone,
      userName: payload.customerName,
      mediaUrl: dress.imageUrl,
      mediaFilename: `${dress.dressName.replace(/\s+/g, "-")}.jpg`,
      templateParams: captionParts,
      source: `booking-dress-${payload.bookingId}-${i}`,
      bookingId: payload.bookingId,
      publicBookingId: payload.publicBookingId,
      step: "dress_image",
    });

    if (result.ok) sent++;
    else {
      failed++;
      errors.push(`${dress.dressName}: ${result.error}`);
    }
  }

  return { sent, failed, errors };
}

/**
 * Send all booking WhatsApp messages in order:
 * text confirmation → (2s) QR image → (2s) each dress image (1s apart).
 */
export async function sendAllBookingMessages(
  payload: BookingConfirmationPayload,
  dresses: DressImagePayload[],
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  const textResult = await sendBookingConfirmationText(payload);
  if (!textResult.ok && !textResult.skipped) errors.push(`Text: ${textResult.error}`);

  await sleep(2000);

  const qrResult = await sendQRCodeImage(payload);
  if (!qrResult.ok && !qrResult.skipped) errors.push(`QR: ${qrResult.error}`);

  await sleep(2000);

  const dressResult = await sendDressImages(payload, dresses);
  if (dressResult.failed > 0) errors.push(...dressResult.errors);

  const ok = Boolean(
    (textResult.ok || textResult.skipped) &&
      (qrResult.ok || qrResult.skipped || !payload.qrCodeUrl) &&
      dressResult.failed === 0,
  );

  return { ok, errors };
}
