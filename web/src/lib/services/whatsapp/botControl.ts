import prisma from "@/lib/prisma";
import type { BotMode, BotStep } from "./botFlow";

export type BotControlAction = "take_over" | "resume_bot" | "restart_flow";

export async function applyBotControl(
  conversationId: number,
  action: BotControlAction,
  opts?: { resumeMode?: "continue" | "restart" | "clear" },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conv = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conv) return { ok: false, error: "Conversation not found" };

  const now = new Date();

  if (action === "take_over") {
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        botMode: "TEAM_HANDLING",
        botUpdatedAt: now,
      },
    });
    return { ok: true };
  }

  if (action === "resume_bot") {
    const mode = opts?.resumeMode ?? "continue";
    if (mode === "restart") {
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          botMode: "ACTIVE",
          botStep: "AWAITING_CATEGORY",
          botCategory: null,
          botDeliveryDate: null,
          botReturnDate: null,
          botSize: null,
          botColour: null,
          botInvalidAttempts: 0,
          botResumedAt: now,
          botUpdatedAt: now,
        },
      });
    } else if (mode === "clear") {
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          botMode: "ACTIVE",
          botStep: "IDLE",
          botCategory: null,
          botDeliveryDate: null,
          botReturnDate: null,
          botSize: null,
          botColour: null,
          botNotes: null,
          botInvalidAttempts: 0,
          botResumedAt: now,
          botUpdatedAt: now,
        },
      });
    } else {
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          botMode: "ACTIVE",
          botResumedAt: now,
          botUpdatedAt: now,
        },
      });
    }
    return { ok: true };
  }

  if (action === "restart_flow") {
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        botMode: "ACTIVE",
        botStep: "AWAITING_CATEGORY",
        botCategory: null,
        botDeliveryDate: null,
        botReturnDate: null,
        botSize: null,
        botColour: null,
        botInvalidAttempts: 0,
        botUpdatedAt: now,
      },
    });
    return { ok: true };
  }

  return { ok: false, error: "Unknown action" };
}

export async function markTeamHandlingOnStaffReply(conversationId: number): Promise<void> {
  await prisma.whatsAppConversation.updateMany({
    where: { id: conversationId, botMode: { not: "TEAM_HANDLING" } },
    data: {
      botMode: "TEAM_HANDLING",
      botUpdatedAt: new Date(),
    },
  });
}

export function serializeBotState(row: {
  botMode: string;
  botStep: string;
  botCategory: string | null;
  botDeliveryDate: string | null;
  botReturnDate: string | null;
  botSize: string | null;
  botColour: string | null;
  botNotes: string | null;
  botInvalidAttempts: number;
  handoverMessageSentAt: Date | null;
  botResumedAt: Date | null;
  botUpdatedAt: Date | null;
}) {
  return {
    botMode: row.botMode as BotMode,
    botStep: row.botStep as BotStep,
    botCategory: row.botCategory,
    botDeliveryDate: row.botDeliveryDate,
    botReturnDate: row.botReturnDate,
    botSize: row.botSize,
    botColour: row.botColour,
    botNotes: row.botNotes,
    botInvalidAttempts: row.botInvalidAttempts,
    handoverMessageSentAt: row.handoverMessageSentAt?.toISOString() ?? null,
    botResumedAt: row.botResumedAt?.toISOString() ?? null,
    botUpdatedAt: row.botUpdatedAt?.toISOString() ?? null,
  };
}
