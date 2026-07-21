import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import {
  classifyWhatsAppInboxMedia,
  sendWhatsAppInboxMediaBuffer,
} from "@/lib/services/whatsapp/metaApi";
import {
  PrivateMediaError,
  savePrivateBookingMedia,
} from "@/lib/storage/privateBookingMedia";
import { enforceRateLimit } from "@/lib/rateLimit";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

function extensionForMime(mimeType: string): "jpg" | "png" | "webp" | "mp4" {
  const mime = mimeType.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("video")) return "mp4";
  return "jpg";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rate = enforceRateLimit(`wa-send-media:${user.id}`, 20, 60_000);
  if (!rate.allowed) return jsonError("Too many WhatsApp uploads. Please wait.", 429);

  const { id } = await params;
  const convId = parseInt(id, 10);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const file = form.get("file");
  const captionRaw = form.get("caption");
  const caption = typeof captionRaw === "string" ? captionRaw.trim() : "";

  if (!(file instanceof File) || file.size === 0) {
    return jsonError("No file provided", 400);
  }

  const mimeType = (file.type || "application/octet-stream").toLowerCase();
  const kind = classifyWhatsAppInboxMedia(mimeType);
  if (!kind) {
    return jsonError("Only JPEG, PNG, WebP images and MP4/3GP videos are supported.", 400);
  }

  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return jsonError(
      kind === "video" ? "Video must be under 16 MB" : "Image must be under 5 MB",
      400,
    );
  }

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: convId },
  });
  if (!conversation) return jsonError("Conversation not found", 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = file.name?.trim() || `${kind}.${extensionForMime(mimeType)}`;

  let privateUrl: string | null = null;
  try {
    privateUrl = await savePrivateBookingMedia(bytes, "whatsapp-inbox", extensionForMime(mimeType));
  } catch (e) {
    if (e instanceof PrivateMediaError && e.code === "PRIVATE_BLOB_NOT_CONFIGURED") {
      /* still send via Meta even if private archive is unavailable */
    } else {
      return jsonError(e instanceof Error ? e.message : "Media storage failed", 500);
    }
  }

  const result = await sendWhatsAppInboxMediaBuffer({
    phone: conversation.customerPhone,
    fileBuffer: bytes,
    filename,
    mimeType,
    caption: caption || undefined,
  });

  if (!result.ok) {
    return jsonError(result.error || "Send failed", 500);
  }

  const saved = await prisma.whatsAppMessage.create({
    data: {
      conversationId: convId,
      phone: conversation.customerPhone,
      direction: "outbound",
      messageType: result.messageType ?? kind,
      body: caption || null,
      filename,
      mediaUrl: privateUrl,
      metaMessageId: result.messageId ?? null,
      isAutomated: false,
      deliveryStatus: "sent",
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { lastMessageAt: new Date() },
  });

  return jsonOk({ ok: true, message: saved });
}
