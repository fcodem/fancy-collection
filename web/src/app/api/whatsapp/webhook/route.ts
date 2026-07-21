import { NextRequest, NextResponse, after } from "next/server";
import {
  acceptWhatsAppWebhookPayload,
  drainWhatsAppWebhookQueue,
} from "@/lib/services/whatsapp/webhookInbound";
import {
  handleWebhookGetVerification,
  handleWebhookPost,
} from "@/lib/services/whatsapp/webhookRouteHandlers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const result = handleWebhookGetVerification({
    mode: searchParams.get("hub.mode"),
    token: searchParams.get("hub.verify_token"),
    challenge: searchParams.get("hub.challenge"),
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  });
  return new NextResponse(result.body, { status: result.status });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const result = await handleWebhookPost(
    rawBody,
    req.headers.get("x-hub-signature-256"),
    {
      acceptPayload: acceptWhatsAppWebhookPayload,
      drainQueue: drainWhatsAppWebhookQueue,
      scheduleDrain: (drain) => {
        after(drain);
      },
    },
  );
  return new NextResponse(result.body, { status: result.status });
}
