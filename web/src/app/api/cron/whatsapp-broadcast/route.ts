import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { drainBroadcastQueue } from "@/lib/services/whatsapp/broadcastSend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Continue durable WhatsApp marketing broadcasts (backup when after() is killed). */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const summary = await drainBroadcastQueue({
      runtimeBudgetMs: 50_000,
      batchSize: 45,
    });
    return jsonOk({ ok: true, ...summary });
  } catch (e) {
    Sentry.captureException(e);
    console.error("whatsapp-broadcast cron failed:", e);
    return jsonError(e instanceof Error ? e.message : "Cron job failed", 500);
  }
}
