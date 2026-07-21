import { formatInboundLocationText } from "./whatsappLocation";

export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppWebhookValue;
    }>;
  }>;
};

export type WhatsAppWebhookValue = {
  messages?: IncomingWhatsAppMessage[];
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  statuses?: WhatsAppMessageStatus[];
};

export type IncomingWhatsAppMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; filename: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

export type WhatsAppMessageStatus = {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

export type ParsedInboundMessage = {
  metaMessageId: string;
  phone: string;
  customerName: string;
  messageType: string;
  body: string;
  filename: string | null;
  receivedAt: Date;
  media: { metaMediaId: string; mimeType: string; filename?: string } | null;
  isTextLike: boolean;
};

export type InboundFollowUpPayload = {
  conversationId: number;
  phone: string;
  metaMessageId: string;
  messageType: string;
  inboundText: string;
  isFirstContact: boolean;
  media: { metaMediaId: string; mimeType: string; filename?: string } | null;
};

export type StatusUpdatePayload = {
  metaMessageId: string;
  status: string;
  deliveryError?: string;
  deliveredAt?: string;
  readAt?: string;
};

export function parseIncomingWhatsAppMessage(
  message: IncomingWhatsAppMessage,
  contact?: { profile: { name: string }; wa_id: string },
): ParsedInboundMessage {
  const phone = `+${message.from}`;
  const customerName = contact?.profile?.name || "Unknown";
  let body = "";
  let filename: string | null = null;
  let media: ParsedInboundMessage["media"] = null;

  switch (message.type) {
    case "text":
      body = message.text?.body || "";
      break;
    case "image":
      body = message.image?.caption || "[Image received]";
      if (message.image?.id) {
        media = {
          metaMediaId: message.image.id,
          mimeType: message.image.mime_type || "image/jpeg",
        };
      }
      break;
    case "document":
      body = message.document?.caption || message.document?.filename || "[Document received]";
      filename = message.document?.filename || null;
      if (message.document?.id) {
        media = {
          metaMediaId: message.document.id,
          mimeType: message.document.mime_type || "application/pdf",
          filename: message.document.filename,
        };
      }
      break;
    case "audio":
      body = "[Voice message received]";
      if (message.audio?.id) {
        media = {
          metaMediaId: message.audio.id,
          mimeType: message.audio.mime_type || "audio/ogg",
        };
      }
      break;
    case "video":
      body = message.video?.caption || "[Video received]";
      if (message.video?.id) {
        media = {
          metaMediaId: message.video.id,
          mimeType: message.video.mime_type || "video/mp4",
        };
      }
      break;
    case "location":
      if (message.location) {
        body = formatInboundLocationText({
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          name: message.location.name,
          address: message.location.address,
        });
      } else {
        body = "[Location received]";
      }
      break;
    case "interactive":
      body =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "[Interactive reply]";
      break;
    default:
      body = `[${message.type} message]`;
  }

  return {
    metaMessageId: message.id,
    phone,
    customerName,
    messageType: message.type,
    body,
    filename,
    receivedAt: new Date(parseInt(message.timestamp, 10) * 1000),
    media,
    isTextLike: message.type === "text" || message.type === "interactive",
  };
}
