import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import {
  drainWhatsAppWebhookQueue,
  repairMissingInboundMedia,
  requeueFailedWebhookFollowUps,
} from "@/lib/services/whatsapp/webhookInbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Drain webhook follow-up queue (media download, auto-reply) — backup when after() does not run. */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const requeued = await requeueFailedWebhookFollowUps({ limit: 20 });
    const drained = await drainWhatsAppWebhookQueue({ limit: 20 });
    const repaired = await repairMissingInboundMedia({ limit: 20 });
    return jsonOk({ ok: true, requeued, drained, repaired });
  } catch (e) {
    Sentry.captureException(e);
    console.error("whatsapp-webhook-queue cron failed:", e);
    return jsonError(e instanceof Error ? e.message : "Cron job failed", 500);
  }
}
