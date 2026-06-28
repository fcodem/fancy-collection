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

    return jsonOk({ conversations });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return jsonOk({ conversations: [] });
    }
    throw e;
  }
}
