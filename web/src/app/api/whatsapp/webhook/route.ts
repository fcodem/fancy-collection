import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireJsonContentType } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  let body: WhatsAppWebhookPayload;
  try {
    body = (await req.json()) as WhatsAppWebhookPayload;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value) {
    return new NextResponse("OK", { status: 200 });
  }

  try {
    if (value.messages) {
      for (const message of value.messages) {
        await processIncomingMessage(message, value.contacts?.[0]);
      }
    }

    if (value.statuses) {
      for (const status of value.statuses) {
        await processMessageStatus(status);
      }
    }
  } catch (e) {
    console.error("[webhook] Processing error:", e);
  }

  return new NextResponse("OK", { status: 200 });
}

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: IncomingMessage[];
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        statuses?: MessageStatus[];
      };
    }>;
  }>;
};

type IncomingMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; filename: string; mime_type: string };
  audio?: { id: string; mime_type: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

type MessageStatus = {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

async function processIncomingMessage(
  message: IncomingMessage,
  contact?: { profile: { name: string }; wa_id: string },
) {
  const phone = `+${message.from}`;
  const customerName = contact?.profile?.name || "Unknown";

  let body = "";
  const messageType = message.type;
  let mediaUrl: string | null = null;

  switch (message.type) {
    case "text":
      body = message.text?.body || "";
      break;
    case "image":
      body = message.image?.caption || "[Image received]";
      mediaUrl = message.image?.id
        ? `https://graph.facebook.com/v21.0/${message.image.id}`
        : null;
      break;
    case "document":
      body = message.document?.filename || "[Document received]";
      mediaUrl = message.document?.id
        ? `https://graph.facebook.com/v21.0/${message.document.id}`
        : null;
      break;
    case "audio":
      body = "[Voice message received]";
      break;
    case "interactive":
      body =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "[Interactive reply]";
      break;
    default:
      body = `[${message.type} message]`;
  }

  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { customerPhone: phone },
  });

  if (!conversation) {
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [
          { whatsappNo: phone },
          { whatsappNo: message.from },
          { contact1: phone },
          { contact1: message.from },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    conversation = await prisma.whatsAppConversation.create({
      data: {
        customerPhone: phone,
        customerName,
        bookingId: booking?.id ?? null,
        isWindowOpen: true,
        windowOpenedAt: new Date(),
        lastMessageAt: new Date(),
        unreadCount: 1,
      },
    });
  } else {
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        isWindowOpen: true,
        windowOpenedAt: new Date(),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        customerName: customerName !== "Unknown" ? customerName : conversation.customerName,
      },
    });
  }

  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      phone,
      direction: "inbound",
      messageType,
      body,
      mediaUrl,
      metaMessageId: message.id,
      isAutomated: false,
      receivedAt: new Date(parseInt(message.timestamp) * 1000),
    },
  });

  console.log(`[webhook] Incoming from ${phone}: "${body}"`);
}

async function processMessageStatus(status: MessageStatus) {
  await prisma.whatsAppMessage.updateMany({
    where: { metaMessageId: status.id },
    data: {
      deliveryStatus: status.status,
      deliveredAt: status.status === "delivered" ? new Date() : undefined,
      readAt: status.status === "read" ? new Date() : undefined,
    },
  });
}
