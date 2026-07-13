import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { sendWhatsAppText } from "@/lib/services/whatsapp/metaApi";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`wa-send:${user.id}`, 40, 60_000);
  if (!rate.allowed) return jsonError("Too many WhatsApp sends. Please wait.", 429);

  const { id } = await params;
  const convId = parseInt(id, 10);
  const body = await req.json() as { message: string };
  const { message } = body;

  if (!message?.trim()) {
    return jsonError("Message cannot be empty", 400);
  }

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: convId },
  });

  if (!conversation) return jsonError("Conversation not found", 404);

  const result = await sendWhatsAppText(conversation.customerPhone, message.trim());

  if (!result.ok) {
    return jsonError(result.error || "Send failed", 500);
  }

  const messageId = result.ok ? result.messageId : undefined;

  const saved = await prisma.whatsAppMessage.create({
    data: {
      conversationId: convId,
      phone: conversation.customerPhone,
      direction: "outbound",
      messageType: "text",
      body: message.trim(),
      metaMessageId: messageId ?? null,
      isAutomated: false,
      deliveryStatus: "sent",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { lastMessageAt: new Date() },
  });

  return jsonOk({ ok: true, message: saved });
}
