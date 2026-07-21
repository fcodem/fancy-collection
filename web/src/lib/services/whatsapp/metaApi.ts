import { normalizeIndianPhone } from "@/lib/phone";

export function graphApiVersion(): string {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

export type WhatsAppSendResult =
  | { ok: true; messageId?: string; raw?: unknown }
  | { ok: false; error: string; skipped?: boolean; errorCode?: number };

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

/** True when Meta rejected a free-form send because the 24h customer-care window is closed. */
export function isOutsideCustomerCareWindowError(
  result: WhatsAppSendResult | { ok: false; error?: string; errorCode?: number },
): boolean {
  if (result.ok) return false;
  const code = "errorCode" in result ? result.errorCode : undefined;
  if (code === 131047 || code === 131026) return true;
  const msg = (result.error || "").toLowerCase();
  return (
    msg.includes("24 hour") ||
    msg.includes("24-hour") ||
    msg.includes("re-engagement") ||
    msg.includes("outside the allowed window")
  );
}

/** Clarify Meta auth failures (expired user tokens often surface as 190 / 131005). */
export function formatWhatsAppApiError(opts: {
  message?: string;
  userMessage?: string;
  code?: number;
  httpStatus?: number;
}): string {
  const msg = opts.userMessage || opts.message || "";
  const code = opts.code;
  const expired =
    code === 190 ||
    /session has expired|access token.*expir|error validating access token/i.test(msg);
  if (expired) {
    return (
      "WhatsApp access token expired. Update WHATSAPP_ACCESS_TOKEN in .env.local " +
      "with a permanent System User token from Meta Business Suite, restart the app, " +
      "then resend the bill." +
      (msg ? ` (Meta: ${msg})` : "")
    );
  }
  if (code === 131005 || /access denied/i.test(msg)) {
    return (
      "WhatsApp access denied — token may be expired or missing permissions. " +
      "Refresh WHATSAPP_ACCESS_TOKEN (System User with whatsapp_business_messaging), " +
      "restart, then resend." +
      (msg ? ` (Meta: ${msg})` : "")
    );
  }
  return msg || `WhatsApp API HTTP ${opts.httpStatus ?? "error"}`;
}

async function postWhatsAppMessage(
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured.", skipped: true };
  }

  const url = `https://graph.facebook.com/${graphApiVersion()}/${metaPhoneId()}/messages`;

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
      signal: opts?.signal,
    });

    const raw = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; error_user_msg?: string; code?: number };
    };

    if (!res.ok) {
      return {
        ok: false,
        error: formatWhatsAppApiError({
          message: raw.error?.message,
          userMessage: raw.error?.error_user_msg,
          code: raw.error?.code,
          httpStatus: res.status,
        }),
        errorCode: raw.error?.code,
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
  opts?: { signal?: AbortSignal },
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: "WhatsApp Meta API is not configured." };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);

  const url = `https://graph.facebook.com/${graphApiVersion()}/${metaPhoneId()}/media`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${metaAccessToken()}` },
      body: form,
      signal: opts?.signal,
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
  const uploaded = await uploadWhatsAppMedia(fileBuffer, filename, mimeType);
  if (!uploaded.ok) return uploaded;
  return sendWhatsAppDocumentByMediaId(phone, uploaded.mediaId, filename, caption);
}

/** Send a document already uploaded to Meta (by media id). */
export async function sendWhatsAppDocumentByMediaId(
  phone: string,
  mediaId: string,
  filename: string,
  caption?: string,
  opts?: { signal?: AbortSignal },
): Promise<WhatsAppSendResult> {
  const to = whatsAppApiPhone(phone);
  if (!to) return { ok: false, error: `Invalid phone number: ${phone}` };

  return postWhatsAppMessage(
    {
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        id: mediaId,
        filename,
        ...(caption ? { caption } : {}),
      },
    },
    opts,
  );
}

/** Send an approved template whose HEADER is a DOCUMENT (PDF booking slip). */
export async function sendWhatsAppDocumentTemplate(opts: {
  phone: string;
  templateName: string;
  languageCode?: string;
  mediaId: string;
  filename: string;
  bodyParams: string[];
}): Promise<WhatsAppSendResult> {
  const to = whatsAppApiPhone(opts.phone);
  if (!to) return { ok: false, error: `Invalid phone number: ${opts.phone}` };

  return postWhatsAppMessage({
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode || "en" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                id: opts.mediaId,
                filename: opts.filename,
              },
            },
          ],
        },
        {
          type: "body",
          parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  });
}

/**
 * Upload a sample file via Meta Resumable Upload API and return a header_handle
 * for creating message templates with IMAGE/VIDEO/DOCUMENT headers.
 *
 * Prefers a user/system token; if META_APP_SECRET is set, also tries an app access token
 * (required on some Meta apps when the system user cannot POST to /{app-id}/uploads).
 */
export async function uploadTemplateMediaHandle(
  fileBuffer: Buffer,
  filename: string,
  mimeType = "application/pdf",
): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const userToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();

  const tokens: Array<{ label: string; token: string }> = [];
  if (userToken) tokens.push({ label: "whatsapp_token", token: userToken });
  if (appId && appSecret) {
    tokens.push({ label: "app_token", token: `${appId}|${appSecret}` });
  }
  if (tokens.length === 0) {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is required for template media upload." };
  }

  const owners = [appId, wabaId].filter(Boolean) as string[];
  if (owners.length === 0) {
    return {
      ok: false,
      error: "META_APP_ID or WHATSAPP_BUSINESS_ACCOUNT_ID is required for template media upload.",
    };
  }

  const version = graphApiVersion();
  const errors: string[] = [];

  for (const { label, token } of tokens) {
    for (const ownerId of owners) {
      try {
        const sessionUrl =
          `https://graph.facebook.com/${version}/${ownerId}/uploads` +
          `?file_name=${encodeURIComponent(filename)}` +
          `&file_length=${fileBuffer.length}` +
          `&file_type=${encodeURIComponent(mimeType)}` +
          `&access_token=${encodeURIComponent(token)}`;

        const sessionRes = await fetch(sessionUrl, { method: "POST" });
        const sessionJson = (await sessionRes.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!sessionRes.ok || !sessionJson.id) {
          errors.push(
            `${label}/${ownerId}: ${sessionJson.error?.message || `session HTTP ${sessionRes.status}`}`,
          );
          continue;
        }

        const uploadRes = await fetch(`https://graph.facebook.com/${version}/${sessionJson.id}`, {
          method: "POST",
          headers: {
            Authorization: `OAuth ${token}`,
            file_offset: "0",
            "Content-Type": mimeType,
          },
          body: new Uint8Array(fileBuffer),
        });
        const uploadJson = (await uploadRes.json().catch(() => ({}))) as {
          h?: string;
          error?: { message?: string };
        };
        if (!uploadRes.ok || !uploadJson.h) {
          errors.push(
            `${label}/${ownerId}: ${uploadJson.error?.message || `binary HTTP ${uploadRes.status}`}`,
          );
          continue;
        }

        return { ok: true, handle: uploadJson.h };
      } catch (e) {
        errors.push(`${label}/${ownerId}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
  }

  return {
    ok: false,
    error:
      errors.slice(0, 4).join(" | ") +
      (errors.length > 4 ? ` (+${errors.length - 4} more)` : "") +
      " — Set META_APP_SECRET, or create the template manually in Meta Business Manager (DOCUMENT header).",
  };
}
