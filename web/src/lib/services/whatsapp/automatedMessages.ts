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
  isOutsideCustomerCareWindowError,
  isWhatsAppConfigured,
  sendWhatsAppDocumentByMediaId,
  sendWhatsAppText,
  uploadWhatsAppMedia,
} from "./metaApi";
import { saveWhatsAppOutboundMessage } from "./messages";
import {
  WHATSAPP_TEAM_LINE,
  whatsAppSignature,
} from "@/lib/slipConstants";
import {
  bookingSlipPdfFilename,
  resolvePublicBookingId,
  returnReceiptPdfFilename,
} from "./publicBookingId";
import { ensurePublicSlipAccess } from "./publicSlipAccess";
import {
  getBookingBillTemplateStatus,
  isWhatsAppSessionOpen,
  sendBookingBillViaTemplate,
} from "./bookingBillTemplate";
import {
  isSlipTemplateApproved,
  resolveApprovedSlipDocumentTemplate,
  sendDocumentSlipTemplate,
  sendTextSlipTemplate,
} from "./slipTemplates";
import {
  bookingSlipDetailsFromBooking,
  buildBookingSlipCaption,
  buildDeliverySlipCaption,
  buildIncompleteSlipCaption,
  buildReturnSlipCaption,
  deliverySlipBodyParamsForTemplate,
  deliverySlipDetailsFromBooking,
  incompleteSlipBodyParamsForTemplate,
  incompleteSlipDetailsFromBooking,
  returnSlipBodyParamsForTemplate,
  returnSlipDetailsFromBooking,
  SLIP_WA_CONTACT_LINE,
} from "./slipMessageCopy";
import { generateBookingBillPdfFallback } from "./bookingBillPdfFallback";
import { generateOperationSlipPdfFallback } from "./operationSlipPdfFallback";

export type WhatsAppSendOutcome = {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  phone?: string;
  messageId?: string;
};

export function buildPostponementHeldMessage(opts: {
  customerName: string;
  publicBookingId: string;
  deliveryDate: string;
  returnDate: string;
}): string {
  return (
    `Hi ${opts.customerName},\n\n` +
    `⏸️ Your booking ${opts.publicBookingId} has been postponed.\n\n` +
    `📅 Scheduled Delivery: ${opts.deliveryDate}\n` +
    `📅 Scheduled Return: ${opts.returnDate}\n\n` +
    `Your advance is held with us. Please contact us when you are ready to reschedule.\n\n` +
    `${SLIP_WA_CONTACT_LINE}\n\n` +
    whatsAppSignature()
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
    `📝 Your booking ${opts.publicBookingId} dates have been updated.\n\n` +
    `📅 Previous Delivery: ${opts.oldDeliveryDate}\n` +
    `📅 New Delivery Date: ${opts.newDeliveryDate}\n` +
    `📅 New Return Date: ${opts.newReturnDate}\n`;
  if (opts.reason?.trim()) msg += `\n📌 Reason: ${opts.reason.trim()}\n`;
  msg += `\n${SLIP_WA_CONTACT_LINE}\n\n${whatsAppSignature()}`;
  return msg;
}

export function buildBookingReminderMessage(opts: {
  customerName: string;
  publicBookingId: string;
  returnDate: string;
  returnTime: string;
}): string {
  return (
    `Hi ${opts.customerName}!\n\n` +
    `⏰ Reminder from ${WHATSAPP_TEAM_LINE}:\n\n` +
    `🔖 Booking: ${opts.publicBookingId}\n` +
    `📅 Return Date: ${opts.returnDate}\n` +
    `🕒 Return Time: ${opts.returnTime?.trim() || "-"}\n\n` +
    `Please plan your return on time. Thank you!\n\n` +
    `${SLIP_WA_CONTACT_LINE}\n\n` +
    whatsAppSignature()
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
    `Hi ${opts.customerName}, this is ${WHATSAPP_TEAM_LINE}.\n\n` +
    `⚠️ Your rental (${opts.publicBookingId}) ${overdueLabel}.\n\n` +
    `📅 Return Date: ${opts.returnDate}\n` +
    `🕒 Return Time: ${opts.returnTime?.trim() || "-"}\n\n` +
    `Please return the outfit(s) as soon as possible or contact us if you need assistance.\n\n` +
    `${SLIP_WA_CONTACT_LINE}\n\n` +
    whatsAppSignature()
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
        include: { item: { select: { color: true, photo: true } } },
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
  } catch (htmlErr) {
    const htmlMsg = htmlErr instanceof Error ? htmlErr.message : "HTML PDF failed";
    console.warn("[sendBookingBillWhatsApp] HTML PDF failed, using jsPDF fallback:", htmlMsg);
    try {
      pdfBuffer = await generateBookingBillPdfFallback(booking, publicBookingId, requestOrigin);
    } catch (e) {
      const err = e instanceof Error ? e.message : "PDF generation failed";
      console.error("[sendBookingBillWhatsApp] PDF error:", err);
      return { ok: false, error: `${htmlMsg} | fallback: ${err}` };
    }
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
  const details = bookingSlipDetailsFromBooking(booking);
  const caption = buildBookingSlipCaption(details);

  const uploaded = await uploadWhatsAppMedia(pdfBuffer, filename);
  if (!uploaded.ok) {
    await saveWhatsAppOutboundMessage({
      bookingId,
      phone: phoneRaw,
      messageType: "document",
      body: caption,
      mediaUrl: pdfUrl || null,
      filename,
      metaMessageId: null,
      status: "failed",
      error: uploaded.error ?? "Media upload failed",
      isAutomated: true,
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { whatsappStatus: "failed", whatsappError: uploaded.error },
    }).catch(() => {});
    return { ok: false, error: uploaded.error, phone: phoneRaw };
  }

  const templateStatus = await getBookingBillTemplateStatus();
  const sessionOpen = await isWhatsAppSessionOpen(phoneRaw);
  const templateReady = templateStatus.ready && templateStatus.kind === "document";

  // Prefer free-form PDF while the 24h session is open (current caption).
  // Cold sends use the APPROVED DOCUMENT template (v3/v2/pdf fallbacks).
  let usedTemplate = false;
  let docResult;

  if (sessionOpen) {
    docResult = await sendWhatsAppDocumentByMediaId(
      phoneRaw,
      uploaded.mediaId,
      filename,
      caption,
    );
    if (!docResult.ok && templateReady) {
      usedTemplate = true;
      docResult = await sendBookingBillViaTemplate({
        phone: phoneRaw,
        mediaId: uploaded.mediaId,
        filename,
        details,
        publicBookingId,
        kind: "document",
        language: templateStatus.language,
        templateName: templateStatus.name,
      });
    }
  } else if (templateReady) {
    usedTemplate = true;
    docResult = await sendBookingBillViaTemplate({
      phone: phoneRaw,
      mediaId: uploaded.mediaId,
      filename,
      details,
      publicBookingId,
      kind: "document",
      language: templateStatus.language,
      templateName: templateStatus.name,
    });
  } else {
    const err =
      templateStatus.error ||
      `WhatsApp DOCUMENT template "${templateStatus.name}" is not APPROVED yet ` +
        `(status: ${templateStatus.status ?? "missing"}). ` +
        `Cold sends need an approved PDF (DOCUMENT) template — not the URL/link template. ` +
        `Ask the customer to send Hi, then resend the bill, or wait for Meta approval of "booking_slip_v3".`;
    docResult = { ok: false as const, error: err };
  }

  // Session free-form blocked by Meta → retry DOCUMENT template if ready.
  if (
    !usedTemplate &&
    !docResult.ok &&
    isOutsideCustomerCareWindowError(docResult) &&
    templateReady
  ) {
    usedTemplate = true;
    docResult = await sendBookingBillViaTemplate({
      phone: phoneRaw,
      mediaId: uploaded.mediaId,
      filename,
      details,
      publicBookingId,
      kind: "document",
      language: templateStatus.language,
      templateName: templateStatus.name,
    });
  }

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: usedTemplate ? "template" : "document",
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

  const publicBookingId = resolvePublicBookingId(booking);
  const message = buildPostponementNoticeMessage({
    customerName: booking.customerName,
    publicBookingId,
    ...payload,
  });

  const useTemplate = await isSlipTemplateApproved("booking_postponed");
  const result = useTemplate
    ? await sendTextSlipTemplate({
        key: "booking_postponed",
        phone: phoneRaw,
        bodyParams: [
          `${publicBookingId} / ${String(booking.monthlySerial).padStart(2, "0")}`,
          payload.newDeliveryDate,
          payload.newReturnDate,
        ],
      })
    : await sendWhatsAppText(phoneRaw, message);

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: useTemplate ? "template" : "text",
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

  const useTemplate = await isSlipTemplateApproved("postponement_held");
  const result = useTemplate
    ? await sendTextSlipTemplate({
        key: "postponement_held",
        phone: phoneRaw,
        bodyParams: [
          `${publicBookingId} / ${String(booking.monthlySerial).padStart(2, "0")}`,
          formatDate(booking.deliveryDate, "display"),
          formatDate(booking.returnDate, "display"),
        ],
      })
    : await sendWhatsAppText(phoneRaw, message);

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: useTemplate ? "template" : "text",
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

  const publicBookingId = resolvePublicBookingId(booking);
  const message = buildBookingReminderMessage({
    customerName: booking.customerName,
    publicBookingId,
    returnDate: formatDate(booking.returnDate, "display"),
    returnTime: booking.returnTime,
  });

  const useTemplate = await isSlipTemplateApproved("return_reminder");
  const result = useTemplate
    ? await sendTextSlipTemplate({
        key: "return_reminder",
        phone: phoneRaw,
        bodyParams: [
          `${publicBookingId} / ${String(booking.monthlySerial).padStart(2, "0")}`,
          formatDate(booking.returnDate, "display"),
          (booking.returnTime || "").trim() || "-",
        ],
      })
    : await sendWhatsAppText(phoneRaw, message);

  await saveWhatsAppOutboundMessage({
    bookingId,
    phone: phoneRaw,
    messageType: useTemplate ? "template" : "text",
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
  } catch (htmlErr) {
    const htmlMsg = htmlErr instanceof Error ? htmlErr.message : "HTML PDF failed";
    console.warn("[sendReturnReceiptWhatsApp] HTML PDF failed, using jsPDF fallback:", htmlMsg);
    try {
      pdfBuffer = generateOperationSlipPdfFallback("return", booking);
    } catch (e) {
      const err = e instanceof Error ? e.message : "PDF generation failed";
      console.error("[sendReturnReceiptWhatsApp] PDF error:", err);
      return { ok: false, error: `${htmlMsg} | fallback: ${err}` };
    }
  }

  let pdfUrl = "";
  try {
    pdfUrl = await uploadReturnSlipPdf(pdfBuffer, publicBookingId);
  } catch (e) {
    console.warn("[sendReturnReceiptWhatsApp] Archive upload failed:", e);
  }

  const filename = returnReceiptPdfFilename(publicBookingId);
  const bookingDetails = bookingSlipDetailsFromBooking(booking);
  const details = returnSlipDetailsFromBooking(booking);
  const caption = buildReturnSlipCaption(details);

  const docResult = await sendSlipDocument({
    bookingId,
    phoneRaw,
    caption,
    filename,
    pdfBuffer,
    pdfUrl,
    templateKey: "return_slip",
    customerName: booking.customerName,
    publicBookingId,
    bodyParamsForTemplate: (templateName) =>
      returnSlipBodyParamsForTemplate(templateName, {
        ...details,
        serialNo: bookingDetails.serialNo,
        returnDate: bookingDetails.returnDate,
        returnTime: bookingDetails.returnTime,
        totalDresses: bookingDetails.totalDresses,
      }),
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
  /** slipTemplates key: delivery_slip | return_slip | incomplete_return_slip */
  templateKey: string;
  customerName: string;
  publicBookingId: string;
  /** Build Meta body params for the resolved APPROVED template name. */
  bodyParamsForTemplate: (templateName: string) => string[];
}): Promise<WhatsAppSendOutcome> {
  const approved = await resolveApprovedSlipDocumentTemplate(opts.templateKey);
  const templateReady = Boolean(approved);
  const sessionOpen = await isWhatsAppSessionOpen(opts.phoneRaw);
  const bodyParams = opts.bodyParamsForTemplate(
    approved?.name || opts.templateKey,
  );

  let docResult;
  let usedTemplate = false;

  const uploaded = await uploadWhatsAppMedia(opts.pdfBuffer, opts.filename);
  if (!uploaded.ok) {
    await saveWhatsAppOutboundMessage({
      bookingId: opts.bookingId,
      phone: opts.phoneRaw,
      messageType: "document",
      body: opts.caption,
      mediaUrl: opts.pdfUrl ?? null,
      filename: opts.filename,
      metaMessageId: null,
      status: "failed",
      error: uploaded.error ?? "Media upload failed",
      isAutomated: true,
    });
    return { ok: false, error: uploaded.error, phone: opts.phoneRaw };
  }

  // Prefer free-form caption (current copy) while the 24h session is open.
  // Fall back to Meta DOCUMENT templates for cold sends.
  // Ensure random slip access token exists for any URL-button templates.
  await ensurePublicSlipAccess(opts.bookingId).catch(() => null);
  if (sessionOpen) {
    docResult = await sendWhatsAppDocumentByMediaId(
      opts.phoneRaw,
      uploaded.mediaId,
      opts.filename,
      opts.caption,
    );
    if (!docResult.ok && templateReady && approved) {
      usedTemplate = true;
      docResult = await sendDocumentSlipTemplate({
        key: opts.templateKey,
        phone: opts.phoneRaw,
        mediaId: uploaded.mediaId,
        filename: opts.filename,
        bodyParams,
        templateName: approved.name,
      });
    }
  } else if (templateReady && approved) {
    usedTemplate = true;
    docResult = await sendDocumentSlipTemplate({
      key: opts.templateKey,
      phone: opts.phoneRaw,
      mediaId: uploaded.mediaId,
      filename: opts.filename,
      bodyParams,
      templateName: approved.name,
    });
  } else {
    docResult = {
      ok: false as const,
      error:
        "WhatsApp session closed and slip template is not APPROVED yet. Ask the customer to send Hi, then resend.",
    };
  }

  // Session looked open but Meta rejected free-form → retry DOCUMENT template.
  if (
    !usedTemplate &&
    !docResult.ok &&
    isOutsideCustomerCareWindowError(docResult) &&
    templateReady &&
    approved
  ) {
    usedTemplate = true;
    docResult = await sendDocumentSlipTemplate({
      key: opts.templateKey,
      phone: opts.phoneRaw,
      mediaId: uploaded.mediaId,
      filename: opts.filename,
      bodyParams,
      templateName: approved.name,
    });
  }

  await saveWhatsAppOutboundMessage({
    bookingId: opts.bookingId,
    phone: opts.phoneRaw,
    messageType: usedTemplate ? "template" : "document",
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
  } catch (htmlErr) {
    const htmlMsg = htmlErr instanceof Error ? htmlErr.message : "HTML PDF failed";
    console.warn("[sendDeliverySlipWhatsApp] HTML PDF failed, using jsPDF fallback:", htmlMsg);
    try {
      pdfBuffer = generateOperationSlipPdfFallback("delivery", booking, itemIds.length ? itemIds : undefined);
    } catch (e) {
      return {
        ok: false,
        error: `${htmlMsg} | fallback: ${e instanceof Error ? e.message : "PDF failed"}`,
      };
    }
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
  const bookingDetails = bookingSlipDetailsFromBooking(booking);
  const details = deliverySlipDetailsFromBooking(booking);
  const caption = buildDeliverySlipCaption(details);

  const result = await sendSlipDocument({
    bookingId,
    phoneRaw,
    caption,
    filename,
    pdfBuffer,
    pdfUrl,
    templateKey: "delivery_slip",
    customerName: booking.customerName,
    publicBookingId,
    bodyParamsForTemplate: (templateName) =>
      deliverySlipBodyParamsForTemplate(templateName, {
        ...details,
        pickupDate: bookingDetails.pickupDate,
        pickupTime: bookingDetails.pickupTime,
      }),
  });
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
  } catch (htmlErr) {
    const htmlMsg = htmlErr instanceof Error ? htmlErr.message : "HTML PDF failed";
    console.warn("[sendPartialReturnSlipWhatsApp] HTML PDF failed, using jsPDF fallback:", htmlMsg);
    try {
      pdfBuffer = generateOperationSlipPdfFallback(
        "return",
        booking,
        itemIds.length ? itemIds : undefined,
      );
    } catch (e) {
      return {
        ok: false,
        error: `${htmlMsg} | fallback: ${e instanceof Error ? e.message : "PDF failed"}`,
      };
    }
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
  const bookingDetails = bookingSlipDetailsFromBooking(booking);
  const details = returnSlipDetailsFromBooking(booking);
  const caption = buildReturnSlipCaption(details);

  const result = await sendSlipDocument({
    bookingId,
    phoneRaw,
    caption,
    filename,
    pdfBuffer,
    pdfUrl,
    templateKey: "return_slip",
    customerName: booking.customerName,
    publicBookingId,
    bodyParamsForTemplate: (templateName) =>
      returnSlipBodyParamsForTemplate(templateName, {
        ...details,
        serialNo: bookingDetails.serialNo,
        returnDate: bookingDetails.returnDate,
        returnTime: bookingDetails.returnTime,
        totalDresses: bookingDetails.totalDresses,
      }),
  });
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
  } catch (htmlErr) {
    const htmlMsg = htmlErr instanceof Error ? htmlErr.message : "HTML PDF failed";
    console.warn("[sendIncompleteSlipWhatsApp] HTML PDF failed, using jsPDF fallback:", htmlMsg);
    try {
      pdfBuffer = generateOperationSlipPdfFallback(
        "incomplete",
        booking,
        ids.length ? ids : undefined,
      );
    } catch (e) {
      return {
        ok: false,
        error: `${htmlMsg} | fallback: ${e instanceof Error ? e.message : "PDF failed"}`,
      };
    }
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
  const details = incompleteSlipDetailsFromBooking(booking, ids.length || 1);
  const caption = buildIncompleteSlipCaption(details);

  const result = await sendSlipDocument({
    bookingId,
    phoneRaw,
    caption,
    filename,
    pdfBuffer,
    pdfUrl,
    templateKey: "incomplete_return_slip",
    customerName: booking.customerName,
    publicBookingId,
    bodyParamsForTemplate: (templateName) =>
      incompleteSlipBodyParamsForTemplate(templateName, details),
  });
  if (result.ok) {
    await markReturnSlipNotified(ids);
  }
  return result;
}
