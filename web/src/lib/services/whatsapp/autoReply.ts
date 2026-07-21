import prisma from "@/lib/prisma";
import {
  isWhatsAppConfigured,
  sendWhatsAppInteractiveButtons,
  sendWhatsAppText,
  sendWhatsAppWelcomeWithLinkButtons,
} from "./metaApi";
import { loadWhatsAppBotSettings } from "./botSettings";
import {
  botBadgeLabel,
  processBotInbound,
  shouldSendAutoWelcome,
  type BotConversationState,
} from "./botFlow";
import {
  customerWelcomeTemplatePreviewBody,
  getCustomerWelcomeTemplateStatus,
  sendCustomerWelcomeTemplate,
} from "./welcomeTemplate";

/** Env-only kill switch (WHATSAPP_BOT_DISABLED=1). Prefer isBotDisabled() for full check. */
export function isAutoReplyDisabled(): boolean {
  const v = process.env.WHATSAPP_BOT_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Master kill switch — env WHATSAPP_BOT_DISABLED or DB botEnabled=false. */
export async function isBotDisabled(): Promise<boolean> {
  if (isAutoReplyDisabled()) return true;
  const settings = await loadWhatsAppBotSettings();
  return !settings.botEnabled;
}

function readState(row: {
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
  lastAutomatedInboundMetaMessageId: string | null;
}): BotConversationState {
  return {
    botMode: row.botMode as BotConversationState["botMode"],
    botStep: row.botStep as BotConversationState["botStep"],
    botCategory: row.botCategory,
    botDeliveryDate: row.botDeliveryDate,
    botReturnDate: row.botReturnDate,
    botSize: row.botSize,
    botColour: row.botColour,
    botNotes: row.botNotes,
    botInvalidAttempts: row.botInvalidAttempts,
    handoverMessageSentAt: row.handoverMessageSentAt,
    lastAutomatedInboundMetaMessageId: row.lastAutomatedInboundMetaMessageId,
  };
}

async function daysSincePreviousInbound(
  conversationId: number,
  currentMetaMessageId: string,
): Promise<number | null> {
  const prior = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId,
      direction: "inbound",
      NOT: { metaMessageId: currentMetaMessageId },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!prior) return null;
  return (Date.now() - prior.createdAt.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * Process inbound WhatsApp message with keyword rules + booking flow.
 * At most one automated reply per inbound Meta message ID.
 */
export async function handleInboundAutoReply(args: {
  conversationId: number;
  phone: string;
  inboundText: string;
  messageType: string;
  metaMessageId: string;
  isFirstContact?: boolean;
}): Promise<void> {
  try {
    if (!isWhatsAppConfigured()) return;
    if (await isBotDisabled()) return;

    const settings = await loadWhatsAppBotSettings();

    const conv = await prisma.whatsAppConversation.findUnique({
      where: { id: args.conversationId },
      select: {
        botMode: true,
        botStep: true,
        botCategory: true,
        botDeliveryDate: true,
        botReturnDate: true,
        botSize: true,
        botColour: true,
        botNotes: true,
        botInvalidAttempts: true,
        handoverMessageSentAt: true,
        lastAutomatedInboundMetaMessageId: true,
      },
    });
    if (!conv) return;

    if (conv.lastAutomatedInboundMetaMessageId === args.metaMessageId) {
      return;
    }

    const state = readState(conv);
    const daysSinceLastInbound = await daysSincePreviousInbound(
      args.conversationId,
      args.metaMessageId,
    );
    const isFirstContact = args.isFirstContact ?? false;
    const shouldSendWelcome = shouldSendAutoWelcome({
      isFirstContact,
      daysSinceLastInbound,
      botMode: state.botMode,
      botStep: state.botStep,
      settings,
    });

    if (shouldSendWelcome) {
      const welcomeTpl = await getCustomerWelcomeTemplateStatus();
      if (welcomeTpl.ready) {
        const sendResult = await sendCustomerWelcomeTemplate(args.phone);
        if (sendResult.ok) {
          const now = new Date();
          const previewBody = customerWelcomeTemplatePreviewBody(settings);
          await prisma.$transaction([
            prisma.whatsAppMessage.create({
              data: {
                conversationId: args.conversationId,
                phone: args.phone,
                direction: "outbound",
                messageType: "template",
                body: previewBody,
                metaMessageId: sendResult.messageId ?? null,
                isAutomated: true,
                deliveryStatus: "sent",
              },
            }),
            prisma.whatsAppConversation.update({
              where: { id: args.conversationId },
              data: {
                lastMessageAt: now,
                lastAutomatedInboundMetaMessageId: args.metaMessageId,
                botUpdatedAt: now,
                lastWelcomeSentAt: now,
                botInvalidAttempts: 0,
              },
            }),
          ]);
          console.log(
            `[bot] Welcome template sent to ${args.phone.replace(/\d(?=\d{4})/g, "*")}`,
          );
          return;
        }
        console.warn(
          `[bot] Welcome template send failed, using interactive fallback: ${sendResult.error}`,
        );
      }
    }

    const result = processBotInbound({
      text: args.inboundText,
      messageType: args.messageType,
      isFirstContact,
      shouldSendWelcome,
      daysSinceLastInbound,
      state,
      settings,
    });

    if (!result.reply?.trim()) {
      await prisma.whatsAppConversation.update({
        where: { id: args.conversationId },
        data: {
          lastAutomatedInboundMetaMessageId: args.metaMessageId,
          botUpdatedAt: new Date(),
          ...(result.nextState.botMode ? { botMode: result.nextState.botMode } : {}),
          ...(result.nextState.botStep ? { botStep: result.nextState.botStep } : {}),
          ...(result.nextState.handoverMessageSentAt
            ? { handoverMessageSentAt: result.nextState.handoverMessageSentAt }
            : {}),
        },
      });
      return;
    }

    const footer = `Call: ${settings.phone} • ${settings.phone2}`;
    const sendResult = result.urlButtons?.length
      ? await sendWhatsAppWelcomeWithLinkButtons(
          args.phone,
          result.reply,
          result.urlButtons,
          { header: settings.shopName, footer },
        )
      : result.quickReplyButtons?.length
        ? await sendWhatsAppInteractiveButtons(args.phone, result.reply, result.quickReplyButtons)
        : await sendWhatsAppText(args.phone, result.reply);

    if (!sendResult.ok) {
      console.warn(`[bot] Auto-reply send failed to ${args.phone}: ${sendResult.error}`);
      return;
    }

    const now = new Date();
    const invalidAttempts = result.resetInvalidAttempts
      ? 0
      : result.incrementInvalidAttempts
        ? state.botInvalidAttempts + 1
        : result.nextState.botInvalidAttempts ?? state.botInvalidAttempts;

    await prisma.$transaction([
      prisma.whatsAppMessage.create({
        data: {
          conversationId: args.conversationId,
          phone: args.phone,
          direction: "outbound",
          messageType: result.urlButtons?.length
            ? "interactive"
            : result.quickReplyButtons?.length
              ? "interactive"
              : "text",
          body: result.reply,
          metaMessageId: sendResult.messageId ?? null,
          isAutomated: true,
          deliveryStatus: "sent",
        },
      }),
      prisma.whatsAppConversation.update({
        where: { id: args.conversationId },
        data: {
          lastMessageAt: now,
          lastAutomatedInboundMetaMessageId: args.metaMessageId,
          botUpdatedAt: now,
          botInvalidAttempts: invalidAttempts,
          ...(result.markWelcomeSent ? { lastWelcomeSentAt: now } : {}),
          ...(result.nextState.botMode ? { botMode: result.nextState.botMode } : {}),
          ...(result.nextState.botStep ? { botStep: result.nextState.botStep } : {}),
          ...(result.nextState.botCategory !== undefined
            ? { botCategory: result.nextState.botCategory }
            : {}),
          ...(result.nextState.botDeliveryDate !== undefined
            ? { botDeliveryDate: result.nextState.botDeliveryDate }
            : {}),
          ...(result.nextState.botReturnDate !== undefined
            ? { botReturnDate: result.nextState.botReturnDate }
            : {}),
          ...(result.nextState.botSize !== undefined ? { botSize: result.nextState.botSize } : {}),
          ...(result.nextState.botColour !== undefined ? { botColour: result.nextState.botColour } : {}),
          ...(result.nextState.handoverMessageSentAt
            ? { handoverMessageSentAt: result.nextState.handoverMessageSentAt }
            : {}),
        },
      }),
    ]);

    console.log(
      `[bot] Auto-replied (${botBadgeLabel({ ...state, ...result.nextState })}) to ${args.phone.replace(/\d(?=\d{4})/g, "*")}`,
    );
  } catch (e) {
    console.error("[bot] Auto-reply error:", e);
  }
}

/** @deprecated Use processBotInbound + loadWhatsAppBotSettings in tests. */
export { processBotInbound, matchKeywordRule, buildKeywordRules } from "./botFlow";
