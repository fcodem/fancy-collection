import {
  META_WEBHOOK_SIGNATURE_HEADER,
  verifyMetaWebhookSignature,
} from "./webhookSignature";
import type { AcceptWebhookResult } from "./webhookInbound";
import type { WhatsAppWebhookPayload } from "./webhookTypes";

export { META_WEBHOOK_SIGNATURE_HEADER };

export function handleWebhookGetVerification(opts: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string | undefined;
}): { status: number; body: string } {
  if (opts.mode === "subscribe" && opts.token === opts.verifyToken && opts.challenge) {
    return { status: 200, body: opts.challenge };
  }
  return { status: 403, body: "Forbidden" };
}

export type WebhookPostDeps = {
  acceptPayload: (body: WhatsAppWebhookPayload) => Promise<AcceptWebhookResult>;
  drainQueue: (opts?: { limit?: number }) => Promise<number>;
  scheduleDrain: (drain: () => Promise<void>) => void;
};

export async function handleWebhookPost(
  rawBody: string,
  signatureHeader: string | null,
  deps: WebhookPostDeps,
): Promise<{ status: number; body: string }> {
  const sig = verifyMetaWebhookSignature(rawBody, signatureHeader);
  if (!sig.ok) {
    return { status: 401, body: "Unauthorized" };
  }

  let body: WhatsAppWebhookPayload;
  try {
    body = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return { status: 400, body: "Bad Request" };
  }

  try {
    await deps.acceptPayload(body);
  } catch {
    /* still acknowledge Meta quickly */
  }

  deps.scheduleDrain(async () => {
    try {
      await deps.drainQueue({ limit: 10 });
    } catch {
      /* logged by drain implementation */
    }
  });

  return { status: 200, body: "OK" };
}
