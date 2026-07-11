import "server-only";

import prisma from "@/lib/prisma";
import { phoneMatchKey } from "@/lib/phone";
import {
  graphApiVersion,
  sendWhatsAppDocumentTemplate,
  uploadTemplateMediaHandle,
  type WhatsAppSendResult,
} from "./metaApi";
import {
  BOOKING_SLIP_TEMPLATE_BODY,
  BOOKING_SLIP_TEMPLATE_EXAMPLE,
  SLIP_WA_FOOTER,
  bookingSlipBodyParams,
  type BookingSlipDetailFields,
} from "./slipMessageCopy";

/** Default Meta template name — DOCUMENT header (PDF). Override with WA_TEMPLATE_BOOKING_BILL. */
export const BOOKING_BILL_TEMPLATE_NAME_DEFAULT = "booking_slip_v4";

/** Legacy URL-button template (ngrok link) — never preferred for sends. */
export const BOOKING_BILL_URL_TEMPLATE_LEGACY = "booking_slip_details";

/** Previous DOCUMENT names before copy redesigns. */
export const BOOKING_BILL_DOCUMENT_LEGACY = "booking_slip_pdf";
export const BOOKING_BILL_DOCUMENT_LEGACY_V2 = "booking_slip_v2";
export const BOOKING_BILL_DOCUMENT_LEGACY_V3 = "booking_slip_v3";

export type BookingBillTemplateKind = "document" | "url" | "unknown";

export function bookingBillTemplateName(): string {
  return (
    process.env.WA_TEMPLATE_BOOKING_BILL?.trim() || BOOKING_BILL_TEMPLATE_NAME_DEFAULT
  ).toLowerCase();
}

export function bookingBillTemplateLanguage(): string {
  return process.env.WA_TEMPLATE_BOOKING_BILL_LANG?.trim() || "en";
}

/** Body for DOCUMENT-header template (PDF first, then booking details). */
export const BOOKING_BILL_TEMPLATE_BODY_DOCUMENT = BOOKING_SLIP_TEMPLATE_BODY;

/** Body for URL-button fallback (same details; link instead of attached PDF). */
export const BOOKING_BILL_TEMPLATE_BODY_URL =
  BOOKING_SLIP_TEMPLATE_BODY +
  `\n\nTap the button below to open your booking slip PDF.`;

export const BOOKING_BILL_TEMPLATE_FOOTER = SLIP_WA_FOOTER;
export const BOOKING_BILL_TEMPLATE_BUTTON_TEXT = "View booking slip";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Public HTTPS origin for template URL buttons (ngrok / production). */
export function whatsAppPublicBaseUrl(): string | null {
  const raw =
    process.env.WHATSAPP_PUBLIC_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return null;
  const base = raw.replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
  if (!/^https:\/\//i.test(base)) return null;
  if (/127\.0\.0\.1|localhost/i.test(base)) return null;
  return base;
}

export function bookingSlipPublicPath(publicBookingId: string): string {
  return `/api/public/booking-slip/${encodeURIComponent(publicBookingId)}`;
}

/** Minimal valid PDF used only as Meta DOCUMENT template header sample. */
export function sampleBookingSlipPdfBuffer(): Buffer {
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 18 Tf 72 720 Td (Fancy Collection booking slip sample) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000386 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
465
%%EOF
`;
  return Buffer.from(pdf, "utf8");
}

/** Whether our DB believes the Meta 24h customer-care window is open for this phone. */
export async function isWhatsAppSessionOpen(phoneRaw: string): Promise<boolean> {
  const key = phoneMatchKey(phoneRaw);
  if (!key) return false;

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      OR: [
        { customerPhone: { endsWith: key } },
        { customerPhone: key },
        { customerPhone: `+91${key}` },
        { customerPhone: `91${key}` },
        { customerPhone: `+${key}` },
      ],
    },
    select: { isWindowOpen: true, windowOpenedAt: true },
    take: 5,
  });

  const now = Date.now();
  return conversations.some((c) => {
    if (!c.isWindowOpen || !c.windowOpenedAt) return false;
    return now - c.windowOpenedAt.getTime() < WINDOW_MS;
  });
}

type MetaTemplateListItem = {
  name: string;
  status: string;
  language: string;
  category?: string;
  id?: string;
  components?: Array<{ type?: string; format?: string; buttons?: unknown[] }>;
};

async function listMessageTemplates(): Promise<
  { ok: true; templates: MetaTemplateListItem[] } | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID missing" };
  }

  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
      `?fields=name,status,category,language,components&limit=100`,
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

/**
 * Custom templates only send from a Cloud API phone that belongs to the same WABA
 * and is CONNECTED. A common misconfig: messaging uses an older phone number ID
 * while templates sit on a PENDING phone under the WABA (error 132001).
 */
export async function isConfiguredPhoneReadyForTemplates(): Promise<{
  ok: boolean;
  ready: boolean;
  configuredPhoneId: string | null;
  wabaPhoneIds: Array<{ id: string; status?: string; display?: string }>;
  error?: string;
}> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const configuredPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null;
  if (!token || !wabaid || !configuredPhoneId) {
    return {
      ok: false,
      ready: false,
      configuredPhoneId,
      wabaPhoneIds: [],
      error: "WhatsApp env incomplete (token / WABA / phone id)",
    };
  }

  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/phone_numbers` +
      `?fields=id,display_phone_number,status,platform_type`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id: string;
      display_phone_number?: string;
      status?: string;
      platform_type?: string;
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      ready: false,
      configuredPhoneId,
      wabaPhoneIds: [],
      error: data.error?.message || `List phones HTTP ${res.status}`,
    };
  }

  const wabaPhoneIds = (data.data || []).map((p) => ({
    id: p.id,
    status: p.status,
    display: p.display_phone_number,
  }));
  const match = (data.data || []).find((p) => p.id === configuredPhoneId);
  const ready =
    Boolean(match) &&
    String(match?.status || "").toUpperCase() === "CONNECTED";

  return {
    ok: true,
    ready,
    configuredPhoneId,
    wabaPhoneIds,
    error: ready
      ? undefined
      : match
        ? `WhatsApp phone ${configuredPhoneId} is on this WABA but status is ${match.status || "unknown"} (need CONNECTED). Register it in Meta with the 2FA PIN.`
        : `WHATSAPP_PHONE_NUMBER_ID (${configuredPhoneId}) is not under WABA ${wabaid}. Custom templates (booking_confirmation, etc.) cannot send from this phone — only hello_world may work. Fix Meta: register the WABA phone for Cloud API, then set WHATSAPP_PHONE_NUMBER_ID to that CONNECTED id.`,
  };
}

function matchBookingTemplate(
  templates: MetaTemplateListItem[],
  name: string,
  language: string,
): MetaTemplateListItem | undefined {
  return templates.find(
    (t) => t.name === name && (t.language === language || t.language?.startsWith(language)),
  );
}

export function detectTemplateKind(template: MetaTemplateListItem): BookingBillTemplateKind {
  const comps = template.components || [];
  const header = comps.find((c) => String(c.type).toUpperCase() === "HEADER");
  if (header && String(header.format).toUpperCase() === "DOCUMENT") return "document";
  const buttons = comps.find((c) => String(c.type).toUpperCase() === "BUTTONS");
  if (buttons?.buttons?.length) return "url";
  return "unknown";
}

export async function getBookingBillTemplateStatus(): Promise<{
  ok: boolean;
  name: string;
  language: string;
  status: string | null;
  kind: BookingBillTemplateKind;
  ready: boolean;
  error?: string;
}> {
  const name = bookingBillTemplateName();
  const language = bookingBillTemplateLanguage();
  const phoneReady = await isConfiguredPhoneReadyForTemplates();
  if (!phoneReady.ready) {
    return {
      ok: phoneReady.ok,
      name,
      language,
      status: null,
      kind: "unknown",
      ready: false,
      error: phoneReady.error,
    };
  }
  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return { ok: false, name, language, status: null, kind: "unknown", ready: false, error: listed.error };
  }

  // Prefer an APPROVED DOCUMENT template (configured name, then default PDF name).
  const candidates = [
    ...new Set([
      name,
      BOOKING_BILL_TEMPLATE_NAME_DEFAULT,
      BOOKING_BILL_DOCUMENT_LEGACY_V2,
      BOOKING_BILL_DOCUMENT_LEGACY,
      BOOKING_BILL_URL_TEMPLATE_LEGACY,
    ]),
  ];
  for (const candidate of candidates) {
    const existing = matchBookingTemplate(listed.templates, candidate, language);
    if (!existing || existing.status !== "APPROVED") continue;
    const kind = detectTemplateKind(existing);
    if (kind === "document") {
      return {
        ok: true,
        name: candidate,
        language: existing.language || language,
        status: existing.status,
        kind: "document",
        ready: true,
      };
    }
  }

  const existing = matchBookingTemplate(listed.templates, name, language);
  if (!existing) {
    return { ok: true, name, language, status: null, kind: "unknown", ready: false };
  }
  const kind = detectTemplateKind(existing);
  // URL-button templates are not treated as "ready" for booking bills — they only send a link.
  return {
    ok: true,
    name,
    language: existing.language || language,
    status: existing.status,
    kind,
    ready: existing.status === "APPROVED" && kind === "document",
    error:
      kind === "url"
        ? `Template "${name}" is a URL-button template (link only). Submit DOCUMENT template "${BOOKING_BILL_TEMPLATE_NAME_DEFAULT}" for PDF attachment.`
        : undefined,
  };
}

export async function sendBookingBillViaTemplate(opts: {
  phone: string;
  mediaId: string;
  filename: string;
  details: BookingSlipDetailFields;
  publicBookingId: string;
  kind?: BookingBillTemplateKind;
  /** Prefer Meta’s approved language code from getBookingBillTemplateStatus(). */
  language?: string;
  /** Override template name (e.g. when status resolved a DOCUMENT alias). */
  templateName?: string;
}): Promise<WhatsAppSendResult> {
  const name = (opts.templateName?.trim() || bookingBillTemplateName()).toLowerCase();
  const language = opts.language?.trim() || bookingBillTemplateLanguage();
  // PDF attach only — never send URL-button templates from this path.
  if (opts.kind === "url") {
    return {
      ok: false,
      error:
        `Refusing URL-button template "${name}" — booking bills must attach a PDF (DOCUMENT header).`,
    };
  }
  const bodyParams = bookingSlipBodyParams(opts.details);

  const sendOnce = (lang: string) =>
    sendWhatsAppDocumentTemplate({
      phone: opts.phone,
      templateName: name,
      languageCode: lang,
      mediaId: opts.mediaId,
      filename: opts.filename,
      bodyParams,
    });

  let result = await sendOnce(language);
  if (
    !result.ok &&
    /132001|translation|language/i.test(result.error || "") &&
    language !== "en_US"
  ) {
    const alt = await sendOnce("en_US");
    if (alt.ok) return alt;
  }
  return result;
}

export type EnsureBookingBillTemplateResult = {
  ok: boolean;
  name: string;
  language: string;
  status?: string;
  id?: string;
  created?: boolean;
  kind?: BookingBillTemplateKind;
  error?: string;
  message?: string;
};

async function createMetaTemplate(payload: Record<string, unknown>): Promise<{
  ok: true;
  id?: string;
  status?: string;
} | { ok: false; error: string }> {
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
      error: data.error?.error_user_msg || data.error?.message || `Create template HTTP ${res.status}`,
    };
  }
  return { ok: true, id: data.id, status: data.status || "PENDING" };
}

/** Create (or report existing) Meta UTILITY DOCUMENT template for PDF booking bills. */
export async function ensureBookingBillTemplate(): Promise<EnsureBookingBillTemplateResult> {
  // Always target the PDF DOCUMENT name — ignore legacy URL template.
  const name =
    process.env.WA_TEMPLATE_BOOKING_BILL?.trim().toLowerCase() ||
    BOOKING_BILL_TEMPLATE_NAME_DEFAULT;
  const language = bookingBillTemplateLanguage();

  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return { ok: false, name, language, error: listed.error };
  }

  const existing = matchBookingTemplate(listed.templates, name, language);
  if (existing) {
    const kind = detectTemplateKind(existing);
    if (kind === "document") {
      return {
        ok: true,
        name,
        language: existing.language || language,
        status: existing.status,
        id: existing.id,
        created: false,
        kind: "document",
        message:
          existing.status === "APPROVED"
            ? `DOCUMENT template "${name}" is APPROVED. Bills attach the PDF in WhatsApp.`
            : `DOCUMENT template "${name}" exists with status ${existing.status}. Wait for Meta approval.`,
      };
    }
    // Same name but URL shape — must use a different DOCUMENT name (cannot convert in place).
    if (name === BOOKING_BILL_URL_TEMPLATE_LEGACY || kind === "url") {
      // fall through to create BOOKING_BILL_TEMPLATE_NAME_DEFAULT if different
      if (name !== BOOKING_BILL_TEMPLATE_NAME_DEFAULT) {
        const pdfExisting = matchBookingTemplate(
          listed.templates,
          BOOKING_BILL_TEMPLATE_NAME_DEFAULT,
          language,
        );
        if (pdfExisting && detectTemplateKind(pdfExisting) === "document") {
          return {
            ok: true,
            name: BOOKING_BILL_TEMPLATE_NAME_DEFAULT,
            language: pdfExisting.language || language,
            status: pdfExisting.status,
            id: pdfExisting.id,
            created: false,
            kind: "document",
            message: `Use DOCUMENT template "${BOOKING_BILL_TEMPLATE_NAME_DEFAULT}" (set WA_TEMPLATE_BOOKING_BILL). Legacy "${name}" is link-only.`,
          };
        }
      } else {
        return {
          ok: false,
          name,
          language,
          kind: "url",
          status: existing.status,
          error:
            `Template "${name}" is URL-button (link only). Rename WA_TEMPLATE_BOOKING_BILL to "${BOOKING_BILL_TEMPLATE_NAME_DEFAULT}" and resubmit to create a DOCUMENT/PDF template.`,
        };
      }
    }
  }

  // Prefer DOCUMENT header (PDF attached in chat). No URL fallback for booking bills.
  const handleResult = await uploadTemplateMediaHandle(
    sampleBookingSlipPdfBuffer(),
    "booking_slip_sample.pdf",
    "application/pdf",
  );

  if (!handleResult.ok) {
    return {
      ok: false,
      name,
      language,
      error:
        `Could not upload PDF sample for DOCUMENT template: ${handleResult.error}. ` +
        `Create "${name}" manually in Meta with Header=Document.`,
    };
  }

  const created = await createMetaTemplate({
    name,
    language,
    category: "UTILITY",
    allow_category_change: true,
    components: [
      {
        type: "HEADER",
        format: "DOCUMENT",
        example: { header_handle: [handleResult.handle] },
      },
      {
        type: "BODY",
        text: BOOKING_BILL_TEMPLATE_BODY_DOCUMENT,
        example: { body_text: [BOOKING_SLIP_TEMPLATE_EXAMPLE] },
      },
      { type: "FOOTER", text: BOOKING_BILL_TEMPLATE_FOOTER },
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
    id: created.id,
    created: true,
    kind: "document",
    message:
      `DOCUMENT template "${name}" submitted. Once Meta marks it APPROVED, booking bills attach the PDF (no ngrok link).`,
  };
}
