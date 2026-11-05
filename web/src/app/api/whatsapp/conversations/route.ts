import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { Prisma } from "@prisma/client";
import { serializeBotState } from "@/lib/services/whatsapp/botControl";
import { botBadgeLabel } from "@/lib/services/whatsapp/botFlow";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const filter = req.nextUrl.searchParams.get("filter") || "all";

  try {
    const where: Prisma.WhatsAppConversationWhereInput = {};
    if (filter === "unread") where.unreadCount = { gt: 0 };
    else if (filter === "needs_staff") where.botMode = "NEEDS_STAFF";
    else if (filter === "team_handling") where.botMode = "TEAM_HANDLING";
    else if (filter === "bot_active") where.botMode = "ACTIVE";
    else if (filter === "booking_enquiries") where.botStep = "READY_FOR_STAFF";

    const rows = await prisma.whatsAppConversation.findMany({
      where,
      include: {
        booking: {
          select: {
            publicBookingId: true,
            customerName: true,
            deliveryDate: true,
            returnDate: true,
            status: true,
          },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });

    // One latest message per conversation; a nested `take: 1` makes Prisma load every message.
    const convIds = rows.map((c) => c.id);
    const latestIds = convIds.length
      ? await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT DISTINCT ON (conversation_id) id
          FROM whatsapp_messages
          WHERE conversation_id = ANY(${convIds}::int[]) AND message_type <> 'reaction'
          ORDER BY conversation_id, created_at DESC, id DESC
        `
      : [];
    const latestMessages = latestIds.length
      ? await prisma.whatsAppMessage.findMany({ where: { id: { in: latestIds.map((r) => r.id) } } })
      : [];
    const latestByConv = new Map(latestMessages.map((m) => [m.conversationId, m]));
    const conversations = rows.map((c) => {
      const last = latestByConv.get(c.id);
      return { ...c, messages: last ? [last] : [] };
    });

    const now = Date.now();
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const enriched = conversations.map((c) => {
      const windowStillOpen =
        c.isWindowOpen && c.windowOpenedAt
          ? now - new Date(c.windowOpenedAt).getTime() < WINDOW_MS
          : false;
      return {
        ...c,
        isWindowOpen: windowStillOpen,
        bot: serializeBotState(c),
        botBadge: botBadgeLabel({ botMode: c.botMode as "ACTIVE", botStep: c.botStep as "IDLE" }),
        botActive: c.botMode === "ACTIVE",
        needsStaff: c.botMode === "NEEDS_STAFF",
        teamHandling: c.botMode === "TEAM_HANDLING",
        bookingEnquiryComplete: c.botStep === "READY_FOR_STAFF",
      };
    });

    return jsonOk({ conversations: enriched });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return jsonOk({ conversations: [] });
    }
    throw e;
  }
}
