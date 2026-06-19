import { endUserSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const session = await prisma.userSession.findUnique({
    where: { id: parseInt(id, 10) },
    include: { user: true },
  });
  if (!session || !session.active) return jsonError("Session not found", 400);
  await endUserSession(session.sessionId, user.id);
  return jsonOk({ ok: true, username: session.user.username });
}
