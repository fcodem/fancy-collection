import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const conversations = await prisma.whatsAppConversation.findMany({
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

    // Mark which conversations a human has taken over (any manual outbound reply).
    const ids = conversations.map((c) => c.id);
    const handledGroups = ids.length
      ? await prisma.whatsAppMessage.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: ids },
            direction: "outbound",
            isAutomated: false,
          },
          _count: { _all: true },
        })
      : [];
    const handledIds = new Set(
      handledGroups.filter((g) => g._count._all > 0).map((g) => g.conversationId),
    );

    const enriched = conversations.map((c) => ({
      ...c,
      humanHandled: handledIds.has(c.id),
      botActive: !handledIds.has(c.id),
    }));

    return jsonOk({ conversations: enriched });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return jsonOk({ conversations: [] });
    }
    throw e;
  }
}
