import { normalizeIndianPhone } from "@/lib/phone";

const GRAPH_API_VERSION = "v21.0";

export type WhatsAppSendResult =
  | { ok: true; messageId?: string; raw?: unknown }
  | { ok: false; error: string; skipped?: boolean };

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

/** Pause all automated slip/receipt WhatsApp sends (booking, delivery, return, incomplete). */
export function isWhatsAppReceiptsDisabled(): boolean {
  const v = process.env.WHATSAPP_RECEIPTS_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const RECEIPT_JOB_TYPES = new Set([
  "booking_bill",
  "delivery_slip",
  "return_receipt",
  "return_slip",
  "incomplete_slip",
  "postponement_held",
  "postponement_notice",
]);

export function isWhatsAppReceiptJobType(jobType: string): boolean {
  return RECEIPT_JOB_TYPES.has(jobType);
}

function metaPhoneId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured.");
  return id;
}

function metaAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  return token;
}

/** Meta Cloud API expects digits only with country code (no + prefix). */
export function whatsAppApiPhone(phone: string): string | null {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) return null;
  return normalized.replace(/^\+/, "");
}

async function postWhatsAppMessage(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${metaPhoneId()}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        ...body,
      }),
    });

    const raw = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        error:
          raw.error?.error_user_msg ||
          raw.error?.message ||
          `WhatsApp API HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: raw.messages?.[0]?.id,
      raw,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "WhatsApp API request failed",
    };
  }
}

export async function sendWhatsAppText(
  phone: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const to = whatsAppApiPhone(phone);
  if (!to) return { ok: false, error: `Invalid phone number: ${phone}` };

  return postWhatsAppMessage({
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = "en",
  components: unknown[] = [],
): Promise<WhatsAppSendResult> {
  const phone = whatsAppApiPhone(to);
  if (!phone) return { ok: false, error: `Invalid phone: ${to}` };

  return postWhatsAppMessage({
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

export async function sendWhatsAppDocument(
  phone: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<WhatsAppSendResult> {
  const to = whatsAppApiPhone(phone);
  if (!to) return { ok: false, error: `Invalid phone number: ${phone}` };

  return postWhatsAppMessage({
    recipient_type: "individual",
    to,
    type: "document",
    document: {
      link: documentUrl,
      filename,
      ...(caption ? { caption } : {}),
    },
  });
}

/** Upload PDF to Meta servers, then send by media ID (works without public URL — required for localhost). */
export async function uploadWhatsAppMedia(
  fileBuffer: Buffer,
  filename: string,
  mimeType = "application/pdf",
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured." };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([fileBuffer], { type: mimeType }), filename);

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${metaPhoneId()}/media`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${metaAccessToken()}` },
      body: form,
    });

    const raw = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!res.ok || !raw.id) {
      return {
        ok: false,
        error:
          raw.error?.error_user_msg ||
          raw.error?.message ||
          `Media upload HTTP ${res.status}`,
      };
    }

    return { ok: true, mediaId: raw.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Media upload failed",
    };
  }
}

export async function sendWhatsAppDocumentBuffer(
  phone: string,
  fileBuffer: Buffer,
  filename: string,
  caption?: string,
  mimeType = "application/pdf",
): Promise<WhatsAppSendResult> {
  const to = whatsAppApiPhone(phone);
  if (!to) return { ok: false, error: `Invalid phone number: ${phone}` };

  const uploaded = await uploadWhatsAppMedia(fileBuffer, filename, mimeType);
  if (!uploaded.ok) return uploaded;

  return postWhatsAppMessage({
    recipient_type: "individual",
    to,
    type: "document",
    document: {
      id: uploaded.mediaId,
      filename,
      ...(caption ? { caption } : {}),
    },
  });
}
