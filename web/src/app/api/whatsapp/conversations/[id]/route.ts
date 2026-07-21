import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { repairMissingInboundMedia } from "@/lib/services/whatsapp/webhookInbound";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id } = await params;
  const convId = parseInt(id, 10);

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: convId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 150 },
      booking: {
        select: {
          id: true,
          publicBookingId: true,
          customerName: true,
          deliveryDate: true,
          returnDate: true,
          status: true,
          whatsappNo: true,
          contact1: true,
        },
      },
    },
  });

  if (!conversation) return jsonError("Not found", 404);

  await repairMissingInboundMedia({ conversationId: convId, limit: 10 });

  const messages = await prisma.whatsAppMessage.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
    take: 150,
  });

  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { unreadCount: 0 },
  });

  // The bot stays active until a human sends a manual (non-automated) reply.
  const humanHandled = messages.some(
    (m) => m.direction === "outbound" && !m.isAutomated,
  );

  return jsonOk({
    conversation: { ...conversation, messages, humanHandled, botActive: !humanHandled },
  });
}
