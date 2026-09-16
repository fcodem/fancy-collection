import "server-only";

import { BRAND_PHONE_PRIMARY } from "@/lib/branding";
import { normalizeIndianPhone, phoneMatchKey } from "@/lib/phone";
import prisma from "@/lib/prisma";
import { sendStaffInboundAlertTemplate } from "./staffInboundAlertTemplate";
import { logWebhookProcessingResult } from "./webhookSignature";

function staffAlertPhone(): string {
  const fromEnv = (process.env.WHATSAPP_STAFF_ALERT_PHONE || "").trim();
  return fromEnv || BRAND_PHONE_PRIMARY;
}

function staffInboundAlertsDisabled(): boolean {
  const v = (process.env.WHATSAPP_STAFF_INBOUND_ALERTS_DISABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function previewText(inboundText: string, messageType: string): string {
  const trimmed = (inboundText || "").trim().replace(/\s+/g, " ");
  if (trimmed) return trimmed.slice(0, 280);
  return `[${messageType || "message"}]`;
}

/**
 * When a customer messages the business WhatsApp number, notify staff on
 * WHATSAPP_STAFF_ALERT_PHONE (default: brand primary 8077843874) via the
 * approved UTILITY template `staff_inbound_alert_v1` (works outside 24h window).
 * Idempotent per inbound metaMessageId so webhook retries do not double-send.
 */
export async function notifyStaffOfInboundCustomerMessage(opts: {
  customerPhone: string;
  inboundText: string;
  messageType: string;
  metaMessageId: string;
}): Promise<void> {
  if (staffInboundAlertsDisabled()) return;
  if (opts.messageType === "reaction") return;

  const alertPhone = staffAlertPhone();
  const alertNorm = normalizeIndianPhone(alertPhone);
  const customerNorm = normalizeIndianPhone(opts.customerPhone);
  if (!alertNorm) return;

  // Do not alert when the sender is the staff number itself.
  if (customerNorm && phoneMatchKey(customerNorm) === phoneMatchKey(alertNorm)) {
    return;
  }

  const dedupeId = `staff-inbound-alert:${opts.metaMessageId}`;
  const already = await prisma.whatsAppMessage.findUnique({
    where: { metaMessageId: dedupeId },
    select: { id: true },
  });
  if (already) return;

  const fromDisplay = customerNorm || opts.customerPhone;
  const preview = previewText(opts.inboundText, opts.messageType);
  const body =
    `New WhatsApp message\n` +
    `From: ${fromDisplay}\n` +
    `${preview}` +
    (opts.metaMessageId ? `\n(ref:${opts.metaMessageId})` : "");

  const result = await sendStaffInboundAlertTemplate({
    phone: alertPhone,
    customerPhone: fromDisplay,
    messagePreview: preview,
  });

  try {
    await prisma.whatsAppMessage.create({
      data: {
        phone: alertNorm,
        direction: "outbound",
        messageType: "template",
        body: result.ok && result.messageId ? `${body}\n(meta:${result.messageId})` : body,
        metaMessageId: dedupeId,
        isAutomated: true,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error || "Template send failed",
      },
    });
  } catch (e) {
    // Unique race on concurrent retry — treat as already notified.
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return;
    }
    throw e;
  }

  if (!result.ok) {
    logWebhookProcessingResult({
      phone: opts.customerPhone,
      metaMessageId: opts.metaMessageId,
      messageType: opts.messageType,
      result: "staff_inbound_alert_failed",
    });
  }
}
