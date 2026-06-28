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
