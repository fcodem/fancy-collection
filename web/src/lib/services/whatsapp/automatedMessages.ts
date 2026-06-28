import prisma from "@/lib/prisma";
import { ensureBookingQrToken, bookingQrDataUrl } from "@/lib/bookingQr";
import { formatDate } from "@/lib/constants";
import { formatSlipDateTime } from "@/lib/slipConstants";
import { photoUrl } from "@/lib/photoUrl";
import { normalizeIndianPhone } from "@/lib/phone";
import {
  generateBookingBillPdf,
  generateReturnReceiptPdf,
  uploadBookingBillPdf,
  uploadReturnReceiptPdf,
  type BookingBillPdfInput,
} from "./bookingBillPdf";
import {
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
  uploadDeliverySlipPdf,
  uploadReturnSlipPdf,
  uploadIncompleteSlipPdf,
  deliverySlipPdfFilename,
  returnSlipPdfFilename,
  incompleteSlipPdfFilename,
} from "./slipPdf";
import {
  buildDeliverySlipData,
  buildReturnSlipData,
  buildIncompleteSlipData,
  SLIP_BIZ,
} from "@/lib/slipBookingData";
import {
  isWhatsAppConfigured,
  sendWhatsAppDocument,
  sendWhatsAppText,
} from "./metaApi";
import { saveWhatsAppOutboundMessage } from "./messages";
import {
  bookingSlipPdfFilename,
  resolvePublicBookingId,
  returnReceiptPdfFilename,
} from "./publicBookingId";

const BUSINESS_NAME =
  process.env.BUSINESS_NAME || "FANCY COLLECTION BY RENU AGARWAL";
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || "8077843874, 8630834711";
const BUSINESS_ADDRESS =
  process.env.BUSINESS_ADDRESS ||
  "Banwata Ganj Near Balaji Mandir Court Road Moradabad 244001";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function thankYouMessage(customerName: string, publicBookingId: string): string {
  return (
    `Thank you for choosing ${BUSINESS_NAME}!\n\n` +
    `Dear ${customerName}, your booking ${publicBookingId} is confirmed. ` +
    `Your booking slip PDF is attached in the next message.\n\n` +
    `RENT | WEAR | RETURN\n${BUSINESS_PHONE}`
  );
}

export function buildPostponementNoticeMessage(opts: {
  customerName: string;
  publicBookingId: string;
  oldDeliveryDate: string;
  newDeliveryDate: string;
  newReturnDate: string;
  reason?: string;
}): string {
  let msg =
    `Hi ${opts.customerName},\n\n` +
    `Your booking ${opts.publicBookingId} dates have been updated.\n\n` +
    `Previous delivery: ${opts.oldDeliveryDate}\n` +
    `New delivery: ${opts.newDeliveryDate}\n` +
    `New return: ${opts.newReturnDate}\n`;
  if (opts.reason?.trim()) msg += `\nReason: ${opts.reason.trim()}\n`;
  msg += `\n— ${BUSINESS_NAME}`;
  return msg;
}

export function buildBookingReminderMessage(opts: {
  customerName: string;
  publicBookingId: string;
  returnDate: string;
  returnTime: string;
}): string {
  return (
    `Hi ${opts.customerName}! Reminder from ${BUSINESS_NAME}: ` +
    `your rental (${opts.publicBookingId}) is due for return tomorrow, ` +
    `${opts.returnDate}${opts.returnTime ? ` by ${opts.returnTime}` : ""}. ` +
    `Please plan your return on time. Thank you!`
  );
}

export async function sendBookingBillWhatsApp(
  bookingId: number,
  requestOrigin?: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  // 1. Fetch full booking with items and their photos
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return { ok: false, error: "Booking not found" };

  // 2. Normalize phone
  const phoneRaw = (booking.whatsappNo?.trim() || booking.contact1?.trim() || "");
  if (!phoneRaw) return { ok: false, error: "No WhatsApp number on booking" };
  if (!normalizeIndianPhone(phoneRaw)) {
    return { ok: false, error: `Invalid phone number: ${phoneRaw}` };
  }

  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);

  if (!booking.publicBookingId) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { publicBookingId },
    });
  }

  // 3. Get existing QR — REUSE, do not generate new
  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, requestOrigin, 280);

  // 4. Build items list
  const items: BookingBillPdfInput["items"] =
    booking.bookingItems.length > 0
      ? booking.bookingItems.map((bi) => ({
          dressName: bi.dressName,
          category: bi.category || "",
          size: bi.size || bi.item?.size || "",
          price: bi.price,
          advance: bi.advance,
          remaining: bi.remaining,
          notes: bi.notes,
          imageUrl: bi.item?.photo ? photoUrl(bi.item.photo) : null,
        }))
      : booking.dressName
        ? [
            {
              dressName: booking.dressName,
              category: "",
              size: "",
              price: booking.totalPrice,
              advance: booking.totalAdvance,
              remaining: booking.totalRemaining,
              notes: booking.notes,
              imageUrl: null,
            },
          ]
        : [];

  // 5. Format dates and build PDF input
  const pdfInput: BookingBillPdfInput = {
    booking: {
      publicBookingId,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress || "",
      contact1: booking.contact1 || "",
      whatsappNo: booking.whatsappNo || booking.contact1 || "",
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime || "",
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime || "",
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit: booking.securityDeposit || 0,
      totalPrice: booking.totalPrice,
      totalAdvance: booking.totalAdvance,
      totalRemaining: booking.totalRemaining,
      commonNotes: booking.commonNotes,
      monthlySerial: booking.monthlySerial,
    },
    items,
    qrDataUrl,
    businessName: BUSINESS_NAME,
    businessPhone: BUSINESS_PHONE,
    businessAddress: BUSINESS_ADDRESS,
    ...(booking.status === "returned"
      ? {
          isReturned: true,
          actualReturnDate: formatSlipDateTime(booking.returnedAt).date,
          actualReturnTime: formatSlipDateTime(booking.returnedAt).time,
          securityRefunded: Math.max(
            0,
            booking.refundAmount || booking.securityCollected - booking.securityHeld,
          ),
          remainingCollected: booking.remainingCollected,
          returnNotes: booking.incompleteNotes || booking.deliveryNotes,
        }
      : {}),
  };

  // 6. Generate merged PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateBookingBillPdf(pdfInput);
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF generation failed";
    console.error("[sendBookingBillWhatsApp] PDF error:", err);
    return { ok: false, error: err };
  }

  // 7. Upload PDF to get public URL
  let pdfUrl: string;
  try {
    pdfUrl = await uploadBookingBillPdf(pdfBuffer, publicBookingId);
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF upload failed";
    console.error("[sendBookingBillWhatsApp] Upload error:", err);
    return { ok: false, error: err };
  }

  const filename = bookingSlipPdfFilename(publicBookingId);

  await prisma.booking.update({
    where: { id: bookingId },
    data: { qrCodeUrl: pdfUrl },
  }).catch(() => {});

  // 8. Send thank you text (best-effort — window may be closed)
  const thankYou = thankYouMessage(booking.customerName, publicBookingId);
  let textResult: { ok: boolean; messageId?: string; error?: string } = { ok: false };
  try {
    textResult = await sendWhatsAppText(phoneRaw, thankYou);
  } catch {
    console.warn("[sendBookingBillWhatsApp] Text message failed (window may be closed)");
  }
  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "text",
    body: thankYou,
    metaMessageId: textResult.ok ? textResult.messageId : null,
    status: textResult.ok ? "sent" : "failed",
    error: textResult.ok ? null : (textResult.error ?? null),
  });

  // 9. Wait before sending document
  await sleep(1500);

  // 10. Send PDF as WhatsApp document
  const docCaption = `📄 Booking Slip — ${publicBookingId}\nQR code, outfit details & T&C included.`;
  const docResult = await sendWhatsAppDocument(phoneRaw, pdfUrl, filename, docCaption);

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "document",
    body: docCaption,
    mediaUrl: pdfUrl,
    filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
  });

  if (!docResult.ok) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { whatsappStatus: "failed", whatsappError: docResult.error },
    }).catch(() => {});
    return { ok: false, error: docResult.error };
  }

  // 11. Update booking WhatsApp status
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      whatsappStatus: "sent",
      whatsappSentAt: new Date(),
      whatsappError: null,
    },
  }).catch(() => {});

  return { ok: true };
}

export async function sendPostponementNoticeWhatsApp(
  bookingId: number,
  payload: {
    oldDeliveryDate: string;
    newDeliveryDate: string;
    newReturnDate: string;
    reason?: string;
  },
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return { ok: false, error: "No WhatsApp number on booking" };

  const publicBookingId =
    resolvePublicBookingId(booking);
  const message = buildPostponementNoticeMessage({
    customerName: booking.customerName,
    publicBookingId,
    ...payload,
  });

  const result = await sendWhatsAppText(phoneRaw, message);
  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "text",
    body: message,
    metaMessageId: result.ok ? result.messageId : null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function sendBookingReminderWhatsApp(
  bookingId: number,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return { ok: false, error: "No WhatsApp number on booking" };

  const publicBookingId =
    resolvePublicBookingId(booking);
  const message = buildBookingReminderMessage({
    customerName: booking.customerName,
    publicBookingId,
    returnDate: formatDate(booking.returnDate, "display"),
    returnTime: booking.returnTime,
  });

  const result = await sendWhatsAppText(phoneRaw, message);
  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "text",
    body: message,
    metaMessageId: result.ok ? result.messageId : null,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function buildReturnReceiptPdfInput(
  booking: {
    publicBookingId: string | null;
    monthlySerial: number;
    customerName: string;
    customerAddress: string;
    contact1: string;
    whatsappNo: string | null;
    deliveryDate: Date;
    deliveryTime: string;
    returnDate: Date;
    returnTime: string;
    venue: string | null;
    staffNames: string | null;
    securityDeposit: number;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    commonNotes: string | null;
    status: string;
    returnedAt: Date | null;
    securityCollected: number;
    securityHeld: number;
    refundAmount: number;
    remainingCollected: number;
    incompleteNotes: string | null;
    deliveryNotes: string | null;
    dressName: string | null;
    notes: string | null;
  },
  items: BookingBillPdfInput["items"],
  qrDataUrl: string,
): BookingBillPdfInput {
  const publicBookingId =
    resolvePublicBookingId(booking);
  const actual = formatSlipDateTime(booking.returnedAt);
  const securityRefunded = Math.max(
    0,
    booking.refundAmount || booking.securityCollected - booking.securityHeld,
  );

  return {
    booking: {
      publicBookingId,
      customerName: booking.customerName,
      customerAddress: booking.customerAddress || "",
      contact1: booking.contact1 || "",
      whatsappNo: booking.whatsappNo || booking.contact1 || "",
      deliveryDate: formatDate(booking.deliveryDate, "display"),
      deliveryTime: booking.deliveryTime || "",
      returnDate: formatDate(booking.returnDate, "display"),
      returnTime: booking.returnTime || "",
      venue: booking.venue,
      staffNames: booking.staffNames,
      securityDeposit: booking.securityDeposit || 0,
      totalPrice: booking.totalPrice,
      totalAdvance: booking.totalAdvance,
      totalRemaining: booking.totalRemaining,
      commonNotes: booking.commonNotes,
      monthlySerial: booking.monthlySerial,
    },
    items,
    qrDataUrl,
    businessName: BUSINESS_NAME,
    businessPhone: BUSINESS_PHONE,
    businessAddress: BUSINESS_ADDRESS,
    isReturned: true,
    actualReturnDate: actual.date,
    actualReturnTime: actual.time,
    securityRefunded,
    lateFee: 0,
    damageCharge:
      booking.status === "incomplete_return" ? Math.max(0, booking.securityHeld) : 0,
    remainingCollected: booking.remainingCollected,
    returnNotes: booking.incompleteNotes || booking.deliveryNotes,
  };
}

export async function sendReturnReceiptWhatsApp(
  bookingId: number,
  requestOrigin?: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.status !== "returned") {
    return { ok: false, error: "Booking must be returned to send return receipt" };
  }

  const phoneRaw = booking.whatsappNo?.trim() || booking.contact1?.trim() || "";
  if (!phoneRaw) return { ok: false, error: "No WhatsApp number on booking" };
  if (!normalizeIndianPhone(phoneRaw)) {
    return { ok: false, error: `Invalid phone number: ${phoneRaw}` };
  }
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const publicBookingId =
    resolvePublicBookingId(booking);

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, requestOrigin, 280);

  const items: BookingBillPdfInput["items"] =
    booking.bookingItems.length > 0
      ? booking.bookingItems.map((bi) => ({
          dressName: bi.dressName,
          category: bi.category || "",
          size: bi.size || bi.item?.size || "",
          price: bi.price,
          advance: bi.advance,
          remaining: bi.remaining,
          notes: bi.notes,
          imageUrl: bi.item?.photo ? photoUrl(bi.item.photo) : null,
        }))
      : booking.dressName
        ? [
            {
              dressName: booking.dressName,
              category: "",
              size: "",
              price: booking.totalPrice,
              advance: booking.totalAdvance,
              remaining: booking.totalRemaining,
              notes: booking.notes,
              imageUrl: null,
            },
          ]
        : [];

  const pdfInput = buildReturnReceiptPdfInput(booking, items, qrDataUrl);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateReturnReceiptPdf(pdfInput);
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF generation failed";
    console.error("[sendReturnReceiptWhatsApp] PDF error:", err);
    return { ok: false, error: err };
  }

  let pdfUrl: string;
  try {
    pdfUrl = await uploadReturnReceiptPdf(pdfBuffer, publicBookingId);
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF upload failed";
    console.error("[sendReturnReceiptWhatsApp] Upload error:", err);
    return { ok: false, error: err };
  }

  const filename = returnReceiptPdfFilename(publicBookingId);
  const thankYou =
    `Dear ${booking.customerName}, 🙏\n` +
    `Your booking ${publicBookingId} has been successfully returned and settled.\n` +
    `Thank you for choosing Team Fancy Collection!\n` +
    `We look forward to serving you again.`;

  let textResult: { ok: boolean; messageId?: string; error?: string } = { ok: false };
  try {
    textResult = await sendWhatsAppText(phoneRaw, thankYou);
  } catch {
    console.warn("[sendReturnReceiptWhatsApp] Text message failed");
  }
  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "text",
    body: thankYou,
    metaMessageId: textResult.ok ? textResult.messageId : null,
    status: textResult.ok ? "sent" : "failed",
    error: textResult.ok ? null : (textResult.error ?? null),
  });

  await sleep(1500);

  const docCaption = `✅ Return Receipt — ${publicBookingId} | Team Fancy Collection`;
  const docResult = await sendWhatsAppDocument(phoneRaw, pdfUrl, filename, docCaption);

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "document",
    body: docCaption,
    mediaUrl: pdfUrl,
    filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
  });

  if (!docResult.ok) {
    return { ok: false, error: docResult.error };
  }

  return { ok: true };
}

type SlipJobScope = "full" | "single" | "combined";

async function fetchBookingForSlip(bookingId: number) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingItems: { include: { item: true } } },
  });
}

async function sendSlipDocument(opts: {
  bookingId: number;
  phoneRaw: string;
  caption: string;
  filename: string;
  pdfUrl: string;
}) {
  const intro = opts.caption.split("\n")[0];
  let textResult: { ok: boolean; messageId?: string; error?: string } = { ok: false };
  try {
    textResult = await sendWhatsAppText(opts.phoneRaw, intro);
  } catch {
    console.warn("[sendSlipDocument] intro text failed");
  }
  await saveWhatsAppOutboundMessage({
    bookingId: opts.bookingId,
    phone: opts.phoneRaw,
    messageType: "text",
    body: intro,
    metaMessageId: textResult.ok ? textResult.messageId : null,
    status: textResult.ok ? "sent" : "failed",
    error: textResult.ok ? null : (textResult.error ?? null),
  });

  await sleep(1500);

  const docResult = await sendWhatsAppDocument(
    opts.phoneRaw,
    opts.pdfUrl,
    opts.filename,
    opts.caption,
  );
  await saveWhatsAppOutboundMessage({
    bookingId: opts.bookingId,
    phone: opts.phoneRaw,
    messageType: "document",
    body: opts.caption,
    mediaUrl: opts.pdfUrl,
    filename: opts.filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
  });

  if (!docResult.ok) return { ok: false as const, error: docResult.error };
  return { ok: true as const };
}

export async function sendDeliverySlipWhatsApp(
  bookingId: number,
  payload: { scope: SlipJobScope; bookingItemId?: number },
  requestOrigin?: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const booking = await fetchBookingForSlip(bookingId);
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo?.trim() || booking.contact1?.trim() || "";
  if (!phoneRaw) return { ok: false, error: "No WhatsApp number on booking" };
  if (!normalizeIndianPhone(phoneRaw)) {
    return { ok: false, error: `Invalid phone number: ${phoneRaw}` };
  }
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);
  const slipData = buildDeliverySlipData(booking, {
    scope: payload.scope,
    bookingItemId: payload.scope === "single" ? payload.bookingItemId : undefined,
  });

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, requestOrigin, 200);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateDeliverySlipPdf({
      ...slipData,
      qrDataUrl,
      businessName: SLIP_BIZ.name,
      businessPhone: SLIP_BIZ.phone,
      businessAddress: SLIP_BIZ.address,
      businessTagline: SLIP_BIZ.tagline,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF generation failed" };
  }

  const suffix =
    payload.scope === "single" && payload.bookingItemId
      ? `_item${payload.bookingItemId}`
      : payload.scope === "combined"
        ? "_partial"
        : "";
  let pdfUrl: string;
  try {
    pdfUrl = await uploadDeliverySlipPdf(pdfBuffer, publicBookingId, suffix);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF upload failed" };
  }

  const filename = deliverySlipPdfFilename(publicBookingId, suffix);
  const caption =
    `📦 Delivery Slip — ${publicBookingId}\n` +
    `Dear ${booking.customerName}, your dress(es) have been delivered. Please see the attached slip.`;

  return sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfUrl });
}

export async function sendPartialReturnSlipWhatsApp(
  bookingId: number,
  payload: { scope: SlipJobScope; bookingItemId?: number },
  requestOrigin?: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const booking = await fetchBookingForSlip(bookingId);
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo?.trim() || booking.contact1?.trim() || "";
  if (!phoneRaw) return { ok: false, error: "No WhatsApp number on booking" };
  if (!normalizeIndianPhone(phoneRaw)) {
    return { ok: false, error: `Invalid phone number: ${phoneRaw}` };
  }
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);
  const slipData = buildReturnSlipData(booking, {
    scope: payload.scope === "full" ? "full" : payload.scope,
    bookingItemId: payload.scope === "single" ? payload.bookingItemId : undefined,
  });

  const qrToken = await ensureBookingQrToken(bookingId);
  const qrDataUrl = await bookingQrDataUrl(qrToken, requestOrigin, 200);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateReturnSlipPdf({
      ...slipData,
      qrDataUrl,
      businessName: SLIP_BIZ.name,
      businessPhone: SLIP_BIZ.phone,
      businessAddress: SLIP_BIZ.address,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF generation failed" };
  }

  const suffix =
    payload.scope === "single" && payload.bookingItemId
      ? `_item${payload.bookingItemId}`
      : payload.scope === "combined"
        ? "_partial"
        : "";
  let pdfUrl: string;
  try {
    pdfUrl = await uploadReturnSlipPdf(pdfBuffer, publicBookingId, suffix);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF upload failed" };
  }

  const filename = returnSlipPdfFilename(publicBookingId, suffix);
  const caption =
    `✅ Return Receipt — ${publicBookingId}\n` +
    `Dear ${booking.customerName}, thank you for returning your dress(es). Receipt attached.`;

  return sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfUrl });
}

export async function sendIncompleteSlipWhatsApp(
  bookingId: number,
  _requestOrigin?: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const booking = await fetchBookingForSlip(bookingId);
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo?.trim() || booking.contact1?.trim() || "";
  if (!phoneRaw) return { ok: false, error: "No WhatsApp number on booking" };
  if (!normalizeIndianPhone(phoneRaw)) {
    return { ok: false, error: `Invalid phone number: ${phoneRaw}` };
  }
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);
  const slipData = buildIncompleteSlipData(booking);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateIncompleteSlipPdf({
      ...slipData,
      businessName: SLIP_BIZ.name,
      businessPhone: SLIP_BIZ.phone,
      businessAddress: SLIP_BIZ.address,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF generation failed" };
  }

  let pdfUrl: string;
  try {
    pdfUrl = await uploadIncompleteSlipPdf(pdfBuffer, publicBookingId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF upload failed" };
  }

  const filename = incompleteSlipPdfFilename(publicBookingId);
  const caption =
    `⚠️ Incomplete Return Notice — ${publicBookingId}\n` +
    `Dear ${booking.customerName}, some item(s) were not fully returned. Details in the attached slip.`;

  return sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfUrl });
}
