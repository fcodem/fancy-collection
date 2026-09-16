import "server-only";

import {
  graphApiVersion,
  sendWhatsAppTemplate,
  type WhatsAppSendResult,
} from "./metaApi";
import { bookingBillTemplateLanguage } from "./bookingBillTemplate";

export const STAFF_INBOUND_ALERT_TEMPLATE_NAME_DEFAULT = "staff_inbound_alert_v1";

export const STAFF_INBOUND_ALERT_TEMPLATE_BODY =
  "New WhatsApp customer message\n\n" +
  "From: {{1}}\n" +
  "Message: {{2}}\n\n" +
  "Open your WhatsApp inbox to reply.";

export const STAFF_INBOUND_ALERT_TEMPLATE_EXAMPLE = [
  "+919876543210",
  "Hi, I want to book a lehenga for 20 Oct",
];

export function staffInboundAlertTemplateName(): string {
  return (
    process.env.WA_TEMPLATE_STAFF_INBOUND_ALERT?.trim().toLowerCase() ||
    STAFF_INBOUND_ALERT_TEMPLATE_NAME_DEFAULT
  );
}

export function staffInboundAlertTemplateLanguage(): string {
  return (
    process.env.WA_TEMPLATE_STAFF_INBOUND_ALERT_LANG?.trim() ||
    process.env.WA_TEMPLATE_SLIPS_LANG?.trim() ||
    bookingBillTemplateLanguage() ||
    "en"
  );
}

type MetaTemplateListItem = {
  name: string;
  status: string;
  language: string;
};

async function listMessageTemplates(): Promise<
  { ok: true; templates: MetaTemplateListItem[] } | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
      `?fields=name,status,language&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: MetaTemplateListItem[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data.error?.message || `List templates HTTP ${res.status}` };
  }
  return { ok: true, templates: data.data || [] };
}

async function createMetaTemplate(payload: Record<string, unknown>): Promise<
  { ok: true; id?: string; status?: string } | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      error:
        data.error?.error_user_msg ||
        data.error?.message ||
        `Create template HTTP ${res.status}`,
    };
  }
  return { ok: true, id: data.id, status: data.status || "PENDING" };
}

export type StaffInboundAlertTemplateStatus = {
  ok: boolean;
  name: string;
  language: string;
  status: string | null;
  ready: boolean;
  error?: string;
  message?: string;
};

export async function getStaffInboundAlertTemplateStatus(): Promise<StaffInboundAlertTemplateStatus> {
  const name = staffInboundAlertTemplateName();
  const language = staffInboundAlertTemplateLanguage();
  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return {
      ok: false,
      name,
      language,
      status: null,
      ready: false,
      error: listed.error,
    };
  }

  const existing = listed.templates.find(
    (t) =>
      t.name.toLowerCase() === name &&
      (t.language === language || t.language?.startsWith(language)),
  );
  if (!existing) {
    return {
      ok: true,
      name,
      language,
      status: null,
      ready: false,
      message: "Template not found on Meta — submit it for approval.",
    };
  }

  const status = (existing.status || "").toUpperCase();
  return {
    ok: true,
    name,
    language,
    status,
    ready: status === "APPROVED",
    message:
      status === "APPROVED"
        ? "Ready to send"
        : `Template status: ${status}. Alerts will work after APPROVED.`,
  };
}

/** Create (or report existing) Meta UTILITY template for staff inbound alerts. */
export async function ensureStaffInboundAlertTemplate(): Promise<{
  ok: boolean;
  name: string;
  language: string;
  status?: string;
  created?: boolean;
  skipped?: boolean;
  error?: string;
  message?: string;
}> {
  const name = staffInboundAlertTemplateName();
  const language = staffInboundAlertTemplateLanguage();
  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return { ok: false, name, language, error: listed.error };
  }

  const existing = listed.templates.find(
    (t) =>
      t.name.toLowerCase() === name &&
      (t.language === language || t.language?.startsWith(language)),
  );
  if (existing) {
    return {
      ok: true,
      name,
      language,
      status: existing.status,
      created: false,
      skipped: true,
      message: `Already exists (${existing.status})`,
    };
  }

  const created = await createMetaTemplate({
    name,
    language,
    category: "UTILITY",
    allow_category_change: true,
    components: [
      {
        type: "BODY",
        text: STAFF_INBOUND_ALERT_TEMPLATE_BODY,
        example: { body_text: [STAFF_INBOUND_ALERT_TEMPLATE_EXAMPLE] },
      },
      {
        type: "FOOTER",
        text: "Fancy Collection — staff alert",
      },
    ],
  });

  if (!created.ok) {
    return { ok: false, name, language, error: created.error };
  }

  return {
    ok: true,
    name,
    language,
    status: created.status,
    created: true,
    message: "UTILITY template submitted to Meta for approval",
  };
}

/** Meta rejects newlines / tabs in template body parameter values. */
export function sanitizeTemplateBodyParam(value: string, maxLen = 200): string {
  const cleaned = (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "-";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

export async function sendStaffInboundAlertTemplate(opts: {
  phone: string;
  customerPhone: string;
  messagePreview: string;
}): Promise<WhatsAppSendResult> {
  const name = staffInboundAlertTemplateName();
  const language = staffInboundAlertTemplateLanguage();
  const from = sanitizeTemplateBodyParam(opts.customerPhone, 40);
  const preview = sanitizeTemplateBodyParam(opts.messagePreview, 200);

  return sendWhatsAppTemplate(opts.phone, name, language, [
    {
      type: "body",
      parameters: [
        { type: "text", text: from },
        { type: "text", text: preview },
      ],
    },
  ]);
}
