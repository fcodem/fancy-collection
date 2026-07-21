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

    const conversations = await prisma.whatsAppConversation.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
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

    const enriched = conversations.map((c) => ({
      ...c,
      bot: serializeBotState(c),
      botBadge: botBadgeLabel({ botMode: c.botMode as "ACTIVE", botStep: c.botStep as "IDLE" }),
      botActive: c.botMode === "ACTIVE",
      needsStaff: c.botMode === "NEEDS_STAFF",
      teamHandling: c.botMode === "TEAM_HANDLING",
      bookingEnquiryComplete: c.botStep === "READY_FOR_STAFF",
    }));

    return jsonOk({ conversations: enriched });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return jsonOk({ conversations: [] });
    }
    throw e;
  }
}
