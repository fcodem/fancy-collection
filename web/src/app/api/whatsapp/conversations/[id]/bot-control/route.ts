import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { applyBotControl, type BotControlAction } from "@/lib/services/whatsapp/botControl";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ct = requireJsonContentType(req);
  if (ct) return ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id } = await params;
  const convId = parseInt(id, 10);
  if (!Number.isFinite(convId)) return jsonError("Invalid conversation id", 400);

  const body = (await req.json()) as {
    action?: BotControlAction;
    resumeMode?: "continue" | "restart" | "clear";
  };

  const action = body.action;
  if (!action || !["take_over", "resume_bot", "restart_flow"].includes(action)) {
    return jsonError("Invalid action", 400);
  }

  const result = await applyBotControl(convId, action, { resumeMode: body.resumeMode });
  if (!result.ok) return jsonError(result.error, 404);

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: convId },
  });
  return jsonOk({ ok: true, conversation });
}
