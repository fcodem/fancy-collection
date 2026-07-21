import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { repairMissingInboundMedia } from "@/lib/services/whatsapp/webhookInbound";
import { serializeBotState } from "@/lib/services/whatsapp/botControl";
import { botBadgeLabel, buildEnquirySummary } from "@/lib/services/whatsapp/botFlow";

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

  const bot = serializeBotState(conversation);
  const enquirySummary =
    conversation.botCategory ||
    conversation.botStep !== "IDLE"
      ? buildEnquirySummary({
          botMode: conversation.botMode as "ACTIVE",
          botStep: conversation.botStep as "IDLE",
          botCategory: conversation.botCategory,
          botDeliveryDate: conversation.botDeliveryDate,
          botReturnDate: conversation.botReturnDate,
          botSize: conversation.botSize,
          botColour: conversation.botColour,
          botNotes: conversation.botNotes,
          botInvalidAttempts: conversation.botInvalidAttempts,
          handoverMessageSentAt: conversation.handoverMessageSentAt,
          lastAutomatedInboundMetaMessageId: conversation.lastAutomatedInboundMetaMessageId,
        })
      : null;

  return jsonOk({
    conversation: {
      ...conversation,
      messages,
      bot,
      botBadge: botBadgeLabel({ botMode: conversation.botMode as "ACTIVE", botStep: conversation.botStep as "IDLE" }),
      botActive: conversation.botMode === "ACTIVE",
      needsStaff: conversation.botMode === "NEEDS_STAFF",
      teamHandling: conversation.botMode === "TEAM_HANDLING",
      bookingEnquiryComplete: conversation.botStep === "READY_FOR_STAFF",
      enquirySummary,
      humanHandled: conversation.botMode === "TEAM_HANDLING",
    },
  });
}
