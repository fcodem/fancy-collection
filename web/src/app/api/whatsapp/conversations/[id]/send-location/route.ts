import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { sendWhatsAppLocation } from "@/lib/services/whatsapp/metaApi";
import {
  formatLocationBody,
  getBusinessWhatsAppLocation,
} from "@/lib/services/whatsapp/whatsappLocation";
import { enforceRateLimit } from "@/lib/rateLimit";
import { markTeamHandlingOnStaffReply } from "@/lib/services/whatsapp/botControl";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`wa-send-location:${user.id}`, 20, 60_000);
  if (!rate.allowed) return jsonError("Too many WhatsApp sends. Please wait.", 429);

  const { id } = await params;
  const convId = parseInt(id, 10);
  const body = (await req.json()) as {
    useBusinessLocation?: boolean;
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: convId },
  });
  if (!conversation) return jsonError("Conversation not found", 404);

  const location = body.useBusinessLocation
    ? getBusinessWhatsAppLocation()
    : typeof body.latitude === "number" && typeof body.longitude === "number"
      ? {
          latitude: body.latitude,
          longitude: body.longitude,
          name: body.name?.trim() || undefined,
          address: body.address?.trim() || undefined,
        }
      : null;

  if (!location) {
    return jsonError(
      "Shop location is not configured. Set BUSINESS_LATITUDE and BUSINESS_LONGITUDE in environment variables.",
      400,
    );
  }

  const result = await sendWhatsAppLocation(conversation.customerPhone, location);
  if (!result.ok) {
    return jsonError(result.error || "Send failed", 500);
  }

  const saved = await prisma.whatsAppMessage.create({
    data: {
      conversationId: convId,
      phone: conversation.customerPhone,
      direction: "outbound",
      messageType: "location",
      body: formatLocationBody(location),
      metaMessageId: result.messageId ?? null,
      isAutomated: false,
      deliveryStatus: "sent",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { lastMessageAt: new Date() },
  });

  await markTeamHandlingOnStaffReply(convId);

  return jsonOk({ ok: true, message: saved });
}
