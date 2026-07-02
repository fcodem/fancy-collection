import "server-only";

import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/constants";
import { normalizeIndianPhone } from "@/lib/phone";
import {
  generateBookingSlipPdf,
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
  uploadBookingSlipPdf,
  uploadDeliverySlipPdf,
  uploadReturnSlipPdf,
  uploadIncompleteSlipPdf,
  deliverySlipPdfFilename,
  returnSlipPdfFilename,
  incompleteSlipPdfFilename,
} from "./slipPdf";
import {
  isWhatsAppConfigured,
  sendWhatsAppDocumentBuffer,
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

const TEAM_NAME = "Team Fancy Collection";

export type WhatsAppSendOutcome = {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  phone?: string;
  messageId?: string;
};

function bookingSlipWhatsAppCaption(customerName: string, serialNo: string): string {
  return (
    `Thank you for choosing ${TEAM_NAME}.\n\n` +
    `Dear ${customerName},\n\n` +
    `Your booking (#${serialNo}) has been confirmed. ` +
    `Please find your booking slip attached for your reference. ` +
    `It includes outfit details, QR code, and terms & conditions.\n\n` +
    `We look forward to serving you.\n\n` +
    `— ${TEAM_NAME}`
  );
}

function deliverySlipWhatsAppCaption(customerName: string, publicBookingId: string): string {
  return (
    `Thank you for choosing ${TEAM_NAME}.\n\n` +
    `Dear ${customerName},\n\n` +
    `Your outfit(s) have been delivered successfully. ` +
    `Please find your delivery slip attached for your records.\n\n` +
    `Kindly return all items on or before the scheduled return date.\n\n` +
    `— ${TEAM_NAME}`
  );
}

function returnSlipWhatsAppCaption(customerName: string, publicBookingId: string): string {
  return (
    `Thank you for choosing ${TEAM_NAME}.\n\n` +
    `Dear ${customerName},\n\n` +
    `Your return has been processed successfully. ` +
    `Please find your return receipt attached for your records.\n\n` +
    `We look forward to serving you again.\n\n` +
    `— ${TEAM_NAME}`
  );
}

function incompleteSlipWhatsAppCaption(customerName: string, publicBookingId: string): string {
  return (
    `Thank you for choosing ${TEAM_NAME}.\n\n` +
    `Dear ${customerName},\n\n` +
    `Some item(s) were not fully returned. ` +
    `Please find the incomplete return notice attached for details.\n\n` +
    `— ${TEAM_NAME}`
  );
}

export function buildPostponementHeldMessage(opts: {
  customerName: string;
  publicBookingId: string;
  deliveryDate: string;
  returnDate: string;
}): string {
  return (
    `Hi ${opts.customerName},\n\n` +
    `Your booking ${opts.publicBookingId} has been postponed.\n\n` +
    `Scheduled delivery: ${opts.deliveryDate}\n` +
    `Scheduled return: ${opts.returnDate}\n\n` +
    `Your advance is held with us. Please contact us when you are ready to reschedule.\n\n` +
    `— ${TEAM_NAME}`
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

export function buildLateReturnReminderMessage(opts: {
  customerName: string;
  publicBookingId: string;
  returnDate: string;
  returnTime: string;
  daysOverdue: number;
}): string {
  const overdueLabel =
    opts.daysOverdue <= 1 ? "is overdue" : `is ${opts.daysOverdue} days overdue`;
  return (
    `Hi ${opts.customerName}, this is ${TEAM_NAME}.\n\n` +
    `Your rental (${opts.publicBookingId}) was due for return on ${opts.returnDate}` +
    `${opts.returnTime ? ` by ${opts.returnTime}` : ""} and ${overdueLabel}.\n\n` +
    `Please return the outfit(s) as soon as possible or contact us if you need assistance.\n\n` +
    `— ${TEAM_NAME}`
  );
}

export async function sendLateReturnReminderWhatsApp(
  bookingId: number,
): Promise<WhatsAppSendOutcome> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };

  if (booking.status !== "delivered") {
    return { ok: true, skipped: true, phone: booking.whatsappNo || booking.contact1 || undefined };
  }

  if (booking.lateReminderSentAt) {
    return { ok: true, skipped: true, phone: booking.whatsappNo || booking.contact1 || undefined };
  }

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return { ok: false, error: "No WhatsApp number on booking" };

  const publicBookingId = resolvePublicBookingId(booking);
  const returnDateDisplay = formatDate(booking.returnDate, "display");
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const returnDay = new Date(booking.returnDate);
  returnDay.setHours(0, 0, 0, 0);
  const daysOverdue = Math.max(
    1,
    Math.floor((startOfToday.getTime() - returnDay.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const message = buildLateReturnReminderMessage({
    customerName: booking.customerName,
    publicBookingId,
    returnDate: returnDateDisplay,
    returnTime: booking.returnTime,
    daysOverdue,
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
    isAutomated: true,
  });

  if (result.ok) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { lateReminderSentAt: new Date() },
    });
  }

  return result.ok
    ? { ok: true, phone: phoneRaw, messageId: result.messageId }
    : { ok: false, error: result.error, phone: phoneRaw };
}

export async function sendBookingBillWhatsApp(
  bookingId: number,
  requestOrigin?: string,
): Promise<WhatsAppSendOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        include: { item: { select: { color: true } } },
      },
    },
  });
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

  if (!booking.publicBookingId) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { publicBookingId },
    });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateBookingSlipPdf(bookingId, requestOrigin);
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF generation failed";
    console.error("[sendBookingBillWhatsApp] PDF error:", err);
    return { ok: false, error: err };
  }

  let pdfUrl = "";
  try {
    pdfUrl = await uploadBookingSlipPdf(pdfBuffer, publicBookingId);
    await prisma.booking.update({
      where: { id: bookingId },
      data: { qrCodeUrl: pdfUrl },
    }).catch(() => {});
  } catch (e) {
    console.warn("[sendBookingBillWhatsApp] Archive upload failed:", e);
  }

  const filename = bookingSlipPdfFilename(publicBookingId);
  const serialNo = String(booking.monthlySerial).padStart(2, "0");
  const caption = bookingSlipWhatsAppCaption(booking.customerName, serialNo);

  const docResult = await sendWhatsAppDocumentBuffer(
    phoneRaw,
    pdfBuffer,
    filename,
    caption,
  );

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "document",
    body: caption,
    mediaUrl: pdfUrl || null,
    filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
    isAutomated: true,
  });

  if (!docResult.ok) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { whatsappStatus: "failed", whatsappError: docResult.error },
    }).catch(() => {});
    return { ok: false, error: docResult.error, phone: phoneRaw };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      whatsappStatus: "sent",
      whatsappSentAt: new Date(),
      whatsappError: null,
    },
  }).catch(() => {});

  return { ok: true, phone: phoneRaw, messageId: docResult.messageId };
}

export async function sendPostponementNoticeWhatsApp(
  bookingId: number,
  payload: {
    oldDeliveryDate: string;
    newDeliveryDate: string;
    newReturnDate: string;
    reason?: string;
  },
): Promise<WhatsAppSendOutcome> {
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
    isAutomated: true,
  });

  return result.ok
    ? { ok: true, phone: phoneRaw, messageId: result.messageId }
    : { ok: false, error: result.error, phone: phoneRaw };
}

export async function sendPostponementHeldWhatsApp(
  bookingId: number,
): Promise<WhatsAppSendOutcome> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };

  const phoneRaw = booking.whatsappNo || booking.contact1;
  if (!phoneRaw?.trim()) return { ok: false, error: "No WhatsApp number on booking" };

  const publicBookingId = resolvePublicBookingId(booking);
  const message = buildPostponementHeldMessage({
    customerName: booking.customerName,
    publicBookingId,
    deliveryDate: formatDate(booking.deliveryDate, "display"),
    returnDate: formatDate(booking.returnDate, "display"),
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
    isAutomated: true,
  });

  return result.ok
    ? { ok: true, phone: phoneRaw, messageId: result.messageId }
    : { ok: false, error: result.error, phone: phoneRaw };
}

export async function sendBookingReminderWhatsApp(
  bookingId: number,
): Promise<WhatsAppSendOutcome> {
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
    isAutomated: true,
  });

  return result.ok
    ? { ok: true, phone: phoneRaw, messageId: result.messageId }
    : { ok: false, error: result.error, phone: phoneRaw };
}

export async function sendReturnReceiptWhatsApp(
  bookingId: number,
  requestOrigin?: string,
): Promise<WhatsAppSendOutcome> {
  const booking = await fetchBookingForSlip(bookingId);
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

  const unnotified = booking.bookingItems.filter(
    (bi) => bi.isDelivered && !bi.returnSlipNotifiedAt,
  );
  if (unnotified.length === 0) {
    return { ok: true, phone: phoneRaw, skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateReturnSlipPdf(bookingId, requestOrigin, { scope: "full" });
  } catch (e) {
    const err = e instanceof Error ? e.message : "PDF generation failed";
    console.error("[sendReturnReceiptWhatsApp] PDF error:", err);
    return { ok: false, error: err };
  }

  let pdfUrl = "";
  try {
    pdfUrl = await uploadReturnSlipPdf(pdfBuffer, publicBookingId);
  } catch (e) {
    console.warn("[sendReturnReceiptWhatsApp] Archive upload failed:", e);
  }

  const filename = returnReceiptPdfFilename(publicBookingId);
  const caption = returnSlipWhatsAppCaption(booking.customerName, publicBookingId);

  const docResult = await sendWhatsAppDocumentBuffer(
    phoneRaw,
    pdfBuffer,
    filename,
    caption,
  );

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: "document",
    body: caption,
    mediaUrl: pdfUrl || null,
    filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
    isAutomated: true,
  });

  if (!docResult.ok) {
    return { ok: false, error: docResult.error, phone: phoneRaw };
  }

  await prisma.bookingItem.updateMany({
    where: {
      bookingId,
      isDelivered: true,
      returnSlipNotifiedAt: null,
    },
    data: { returnSlipNotifiedAt: new Date() },
  });

  return { ok: true, phone: phoneRaw, messageId: docResult.messageId };
}

type SlipJobScope = "full" | "single" | "combined";

type SlipSendPayload = {
  scope: SlipJobScope;
  bookingItemId?: number;
  bookingItemIds?: number[];
};

async function markDeliverySlipNotified(bookingItemIds: number[]) {
  if (!bookingItemIds.length) return;
  await prisma.bookingItem.updateMany({
    where: { id: { in: bookingItemIds }, deliverySlipNotifiedAt: null },
    data: { deliverySlipNotifiedAt: new Date() },
  });
}

async function markReturnSlipNotified(bookingItemIds: number[]) {
  if (!bookingItemIds.length) return;
  await prisma.bookingItem.updateMany({
    where: { id: { in: bookingItemIds }, returnSlipNotifiedAt: null },
    data: { returnSlipNotifiedAt: new Date() },
  });
}

function slipItemIds(payload: SlipSendPayload): number[] {
  if (payload.bookingItemIds?.length) return payload.bookingItemIds;
  if (payload.bookingItemId != null) return [payload.bookingItemId];
  return [];
}

async function deliverySlipAlreadySent(
  bookingId: number,
  payload: SlipSendPayload,
): Promise<boolean> {
  const ids = slipItemIds(payload);
  if (ids.length) {
    const pending = await prisma.bookingItem.count({
      where: { id: { in: ids }, deliverySlipNotifiedAt: null },
    });
    return pending === 0;
  }
  if (payload.scope === "full") {
    const pending = await prisma.bookingItem.count({
      where: { bookingId, isDelivered: true, deliverySlipNotifiedAt: null },
    });
    return pending === 0;
  }
  return false;
}

async function returnSlipAlreadySent(
  bookingId: number,
  payload: SlipSendPayload,
): Promise<boolean> {
  const ids = slipItemIds(payload);
  if (ids.length) {
    const pending = await prisma.bookingItem.count({
      where: { id: { in: ids }, returnSlipNotifiedAt: null },
    });
    return pending === 0;
  }
  const pending = await prisma.bookingItem.count({
    where: {
      bookingId,
      isReturned: true,
      isIncompleteReturn: false,
      returnSlipNotifiedAt: null,
    },
  });
  return pending === 0;
}

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
  pdfBuffer: Buffer;
  pdfUrl?: string;
}): Promise<WhatsAppSendOutcome> {
  const docResult = await sendWhatsAppDocumentBuffer(
    opts.phoneRaw,
    opts.pdfBuffer,
    opts.filename,
    opts.caption,
  );
  await saveWhatsAppOutboundMessage({
    bookingId: opts.bookingId,
    phone: opts.phoneRaw,
    messageType: "document",
    body: opts.caption,
    mediaUrl: opts.pdfUrl ?? null,
    filename: opts.filename,
    metaMessageId: docResult.ok ? docResult.messageId : null,
    status: docResult.ok ? "sent" : "failed",
    error: docResult.ok ? null : (docResult.error ?? null),
    isAutomated: true,
  });

  if (!docResult.ok) {
    return { ok: false, error: docResult.error, phone: opts.phoneRaw };
  }
  return { ok: true, phone: opts.phoneRaw, messageId: docResult.messageId };
}

export async function sendDeliverySlipWhatsApp(
  bookingId: number,
  payload: SlipSendPayload,
  requestOrigin?: string,
): Promise<WhatsAppSendOutcome> {
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

  if (await deliverySlipAlreadySent(bookingId, payload)) {
    return { ok: true, phone: phoneRaw, skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);
  const itemIds = slipItemIds(payload);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateDeliverySlipPdf(bookingId, requestOrigin, {
      scope: payload.scope,
      bookingItemId: payload.scope === "single" ? payload.bookingItemId : undefined,
      bookingItemIds: itemIds.length ? itemIds : undefined,
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
  let pdfUrl = "";
  try {
    pdfUrl = await uploadDeliverySlipPdf(pdfBuffer, publicBookingId, suffix);
  } catch (e) {
    console.warn("[sendDeliverySlipWhatsApp] Archive upload failed:", e);
  }

  const filename = deliverySlipPdfFilename(publicBookingId, suffix);
  const caption = deliverySlipWhatsAppCaption(booking.customerName, publicBookingId);

  const result = await sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfBuffer, pdfUrl });
  if (result.ok) {
    const markIds =
      itemIds.length > 0
        ? itemIds
        : (
            await prisma.bookingItem.findMany({
              where: { bookingId, isDelivered: true, deliverySlipNotifiedAt: null },
              select: { id: true },
            })
          ).map((r) => r.id);
    await markDeliverySlipNotified(markIds);
  }
  return result;
}

export async function sendPartialReturnSlipWhatsApp(
  bookingId: number,
  payload: SlipSendPayload,
  requestOrigin?: string,
): Promise<WhatsAppSendOutcome> {
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

  if (await returnSlipAlreadySent(bookingId, payload)) {
    return { ok: true, phone: phoneRaw, skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);
  const itemIds = slipItemIds(payload);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateReturnSlipPdf(bookingId, requestOrigin, {
      scope: payload.scope === "full" ? "full" : payload.scope,
      bookingItemId: payload.scope === "single" ? payload.bookingItemId : undefined,
      bookingItemIds: itemIds.length ? itemIds : undefined,
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
  let pdfUrl = "";
  try {
    pdfUrl = await uploadReturnSlipPdf(pdfBuffer, publicBookingId, suffix);
  } catch (e) {
    console.warn("[sendPartialReturnSlipWhatsApp] Archive upload failed:", e);
  }

  const filename = returnSlipPdfFilename(publicBookingId, suffix);
  const caption = returnSlipWhatsAppCaption(booking.customerName, publicBookingId);

  const result = await sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfBuffer, pdfUrl });
  if (result.ok) {
    const markIds =
      itemIds.length > 0
        ? itemIds
        : (
            await prisma.bookingItem.findMany({
              where: {
                bookingId,
                isReturned: true,
                isIncompleteReturn: false,
                returnSlipNotifiedAt: null,
              },
              select: { id: true },
            })
          ).map((r) => r.id);
    await markReturnSlipNotified(markIds);
  }
  return result;
}

export async function sendIncompleteSlipWhatsApp(
  bookingId: number,
  payload: SlipSendPayload,
  requestOrigin?: string,
): Promise<WhatsAppSendOutcome> {
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

  const itemIds = slipItemIds(payload);
  const ids =
    itemIds.length > 0
      ? itemIds
      : booking.bookingItems
          .filter((bi) => bi.isIncompleteReturn && !bi.returnSlipNotifiedAt)
          .map((bi) => bi.id);

  if (ids.length === 0) {
    return { ok: true, phone: phoneRaw, skipped: true };
  }

  const publicBookingId = resolvePublicBookingId(booking);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateIncompleteSlipPdf(bookingId, requestOrigin, {
      scope: payload.scope === "full" ? "combined" : payload.scope,
      bookingItemId: payload.scope === "single" ? payload.bookingItemId : undefined,
      bookingItemIds: ids,
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
  let pdfUrl = "";
  try {
    pdfUrl = await uploadIncompleteSlipPdf(pdfBuffer, publicBookingId, suffix);
  } catch (e) {
    console.warn("[sendIncompleteSlipWhatsApp] Archive upload failed:", e);
  }

  const filename = incompleteSlipPdfFilename(publicBookingId, suffix);
  const caption = incompleteSlipWhatsAppCaption(booking.customerName, publicBookingId);

  const result = await sendSlipDocument({ bookingId, phoneRaw, caption, filename, pdfBuffer, pdfUrl });
  if (result.ok) {
    await markReturnSlipNotified(ids);
  }
  return result;
}
