import crypto from "crypto";

export const META_WEBHOOK_SIGNATURE_HEADER = "x-hub-signature-256";

export type MetaWebhookSignatureResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "bad_format" | "invalid" };

/** Compute Meta webhook signature for tests and verification. */
export function computeMetaWebhookSignature(rawBody: string, secret: string): string {
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${digest}`;
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): MetaWebhookSignatureResult {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "development") return { ok: true };
    return { ok: false, reason: "missing_secret" };
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "missing_signature" };
  }

  const expected = computeMetaWebhookSignature(rawBody, secret);
  const provided = signatureHeader.trim();

  if (!provided.startsWith("sha256=")) {
    return { ok: false, reason: "bad_format" };
  }

  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function maskPhoneForWebhookLog(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `******${digits.slice(-4)}`;
}

export function logWebhookProcessingResult(opts: {
  phone?: string;
  metaMessageId?: string;
  messageType?: string;
  result: string;
}): void {
  console.info(
    "[webhook]",
    JSON.stringify({
      phone: opts.phone ? maskPhoneForWebhookLog(opts.phone) : undefined,
      metaMessageId: opts.metaMessageId,
      messageType: opts.messageType,
      result: opts.result,
    }),
  );
}
