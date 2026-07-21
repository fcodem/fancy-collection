import "server-only";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleInboundAutoReply } from "./autoReply";
import { logWebhookProcessingResult } from "./webhookSignature";
import { storeWhatsAppInboundMedia } from "./webhookMedia";
import type {
  InboundFollowUpPayload,
  ParsedInboundMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhookPayload,
} from "./webhookTypes";
import { parseIncomingWhatsAppMessage } from "./webhookTypes";

export type PersistInboundResult =
  | { duplicate: true; metaMessageId: string }
  | {
      duplicate: false;
      metaMessageId: string;
      conversationId: number;
      isFirstContact: boolean;
      followUp: InboundFollowUpPayload;
    };

export async function persistInboundWhatsAppMessage(
  parsed: ParsedInboundMessage,
): Promise<PersistInboundResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.whatsAppMessage.findUnique({
        where: { metaMessageId: parsed.metaMessageId },
        select: { id: true, conversationId: true },
      });
      if (existing) {
        return { duplicate: true, metaMessageId: parsed.metaMessageId };
      }

      let conversation = await tx.whatsAppConversation.findUnique({
        where: { customerPhone: parsed.phone },
      });
      const isFirstContact = !conversation;

      if (!conversation) {
        conversation = await tx.whatsAppConversation.create({
          data: {
            customerPhone: parsed.phone,
            customerName: parsed.customerName,
            isWindowOpen: true,
            windowOpenedAt: new Date(),
            lastMessageAt: new Date(),
            unreadCount: 1,
          },
        });
      } else {
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            isWindowOpen: true,
            windowOpenedAt: new Date(),
            lastMessageAt: new Date(),
            unreadCount: { increment: 1 },
            ...(parsed.customerName !== "Unknown"
              ? { customerName: parsed.customerName }
              : {}),
          },
        });
      }

      await tx.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          phone: parsed.phone,
          direction: "inbound",
          messageType: parsed.messageType,
          body: parsed.body,
          filename: parsed.filename,
          mediaUrl: null,
          metaMessageId: parsed.metaMessageId,
          isAutomated: false,
          receivedAt: parsed.receivedAt,
        },
      });

      return {
        duplicate: false,
        metaMessageId: parsed.metaMessageId,
        conversationId: conversation.id,
        isFirstContact,
        followUp: {
          conversationId: conversation.id,
          phone: parsed.phone,
          metaMessageId: parsed.metaMessageId,
          messageType: parsed.messageType,
          inboundText: parsed.body,
          isFirstContact,
          media: parsed.media,
        },
      };
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return { duplicate: true, metaMessageId: parsed.metaMessageId };
    }
    throw e;
  }
}

export async function enqueueWebhookFollowUp(
  eventType: "inbound_followup" | "status_update",
  metaMessageId: string | null,
  payload: InboundFollowUpPayload,
): Promise<void> {
  try {
    await prisma.whatsAppWebhookQueue.create({
      data: {
        eventType,
        metaMessageId,
        payload: payload as Prisma.InputJsonValue,
        status: "pending",
      },
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return;
    throw e;
  }
}

export async function persistStatusUpdate(status: WhatsAppMessageStatus): Promise<boolean> {
  const deliveryError =
    status.status === "failed" && status.errors?.length
      ? status.errors.map((e) => e.title || String(e.code)).join("; ")
      : undefined;

  const updated = await prisma.whatsAppMessage.updateMany({
    where: { metaMessageId: status.id },
    data: {
      deliveryStatus: status.status,
      deliveredAt: status.status === "delivered" ? new Date() : undefined,
      readAt: status.status === "read" ? new Date() : undefined,
      ...(deliveryError ? { error: deliveryError } : {}),
    },
  });

  if (status.status === "failed") {
    logWebhookProcessingResult({
      metaMessageId: status.id,
      messageType: "status",
      result: `delivery_failed:${deliveryError ?? "unknown"}`,
    });
  }

  return updated.count > 0;
}

export type AcceptWebhookResult = {
  accepted: number;
  duplicates: number;
  queued: number;
};

/** Fast path: persist events and queue follow-up work. No media download or auto-reply here. */
export async function acceptWhatsAppWebhookPayload(
  body: WhatsAppWebhookPayload,
): Promise<AcceptWebhookResult> {
  const result: AcceptWebhookResult = { accepted: 0, duplicates: 0, queued: 0 };
  const entry = body?.entry?.[0];
  const value = entry?.changes?.[0]?.value;
  if (!value) return result;

  if (value.messages) {
    for (const message of value.messages) {
      const parsed = parseIncomingWhatsAppMessage(message, value.contacts?.[0]);
      const persisted = await persistInboundWhatsAppMessage(parsed);
      if (persisted.duplicate) {
        result.duplicates += 1;
        logWebhookProcessingResult({
          phone: parsed.phone,
          metaMessageId: parsed.metaMessageId,
          messageType: parsed.messageType,
          result: "duplicate_ignored",
        });
        continue;
      }

      result.accepted += 1;
      await enqueueWebhookFollowUp("inbound_followup", parsed.metaMessageId, persisted.followUp);
      result.queued += 1;
      logWebhookProcessingResult({
        phone: parsed.phone,
        metaMessageId: parsed.metaMessageId,
        messageType: parsed.messageType,
        result: "accepted",
      });
    }
  }

  if (value.statuses) {
    for (const status of value.statuses) {
      await persistStatusUpdate(status);
      result.accepted += 1;
      logWebhookProcessingResult({
        metaMessageId: status.id,
        messageType: "status",
        result: status.status,
      });
    }
  }

  return result;
}

export async function processInboundFollowUp(payload: InboundFollowUpPayload): Promise<void> {
  if (payload.media) {
    const privateUrl = await storeWhatsAppInboundMedia(payload.media);
    if (privateUrl) {
      await prisma.whatsAppMessage.updateMany({
        where: { metaMessageId: payload.metaMessageId },
        data: { mediaUrl: privateUrl },
      });
    }
  }

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [
        { whatsappNo: payload.phone },
        { whatsappNo: payload.phone.replace(/^\+/, "") },
        { contact1: payload.phone },
        { contact1: payload.phone.replace(/^\+/, "") },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (booking) {
    await prisma.whatsAppConversation.updateMany({
      where: { id: payload.conversationId, bookingId: null },
      data: { bookingId: booking.id },
    });
  }

  await handleInboundAutoReply({
    conversationId: payload.conversationId,
    phone: payload.phone,
    inboundText: payload.inboundText,
    messageType: payload.messageType,
    isFirstContact: payload.isFirstContact,
  });

  logWebhookProcessingResult({
    phone: payload.phone,
    metaMessageId: payload.metaMessageId,
    messageType: payload.messageType,
    result: "followup_complete",
  });
}

export async function drainWhatsAppWebhookQueue(opts?: { limit?: number }): Promise<number> {
  const limit = opts?.limit ?? 10;
  const pending = await prisma.whatsAppWebhookQueue.findMany({
    where: { status: "pending", scheduledAt: { lte: new Date() } },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let processed = 0;
  for (const row of pending) {
    const claimed = await prisma.whatsAppWebhookQueue.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;

    try {
      if (row.eventType === "inbound_followup") {
        await processInboundFollowUp(row.payload as InboundFollowUpPayload);
      }
      await prisma.whatsAppWebhookQueue.update({
        where: { id: row.id },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Webhook queue item failed";
      const attemptNumber = row.attempts + 1;
      await prisma.whatsAppWebhookQueue.update({
        where: { id: row.id },
        data: {
          status: attemptNumber >= 3 ? "failed" : "pending",
          lastError: msg.slice(0, 500),
          scheduledAt: new Date(Date.now() + 30_000),
        },
      });
    }
  }

  return processed;
}
