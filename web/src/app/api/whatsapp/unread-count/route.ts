import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { Prisma } from "@prisma/client";
import { cachedQuery } from "@/lib/perfCache";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const total = await cachedQuery(["whatsapp-unread-total"], async () => {
      const rows = await prisma.whatsAppConversation.aggregate({
        _sum: { unreadCount: true },
      });
      return rows._sum.unreadCount ?? 0;
    }, 15);

    return jsonOk({ total });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return jsonOk({ total: 0 });
    }
    throw e;
  }
}
