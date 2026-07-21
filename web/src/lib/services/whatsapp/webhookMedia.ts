import "server-only";

import { graphApiVersion } from "./metaApi";
import { savePrivateBookingMedia } from "@/lib/storage/privateBookingMedia";

export type InboundMediaDescriptor = {
  metaMediaId: string;
  mimeType: string;
  filename?: string;
};

function extensionForMime(
  mimeType: string,
  filename?: string,
): "jpg" | "png" | "webp" | "pdf" | "mp4" | "mp3" | "ogg" | "webm" {
  const mime = mimeType.toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mp4") || mime.includes("video")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3") || mime.includes("audio")) return "mp3";
  if (mime.includes("webm")) return "webm";
  if (filename?.toLowerCase().endsWith(".pdf")) return "pdf";
  if (filename?.toLowerCase().endsWith(".png")) return "png";
  return "jpg";
}

function whatsAppAccessToken(): string | null {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || null;
}

/** Resolve Meta media metadata and download bytes using WHATSAPP_ACCESS_TOKEN. */
export async function downloadWhatsAppInboundMedia(
  descriptor: InboundMediaDescriptor,
): Promise<Buffer | null> {
  const token = whatsAppAccessToken();
  if (!token) return null;

  const version = graphApiVersion();
  const metaRes = await fetch(`https://graph.facebook.com/${version}/${descriptor.metaMediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!metaRes.ok) return null;

  const meta = (await metaRes.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
  };
  if (!meta.url) return null;

  const downloadRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!downloadRes.ok) return null;

  return Buffer.from(await downloadRes.arrayBuffer());
}

/** Store inbound WhatsApp media in private blob storage; returns private URL/path only. */
export async function storeWhatsAppInboundMedia(
  descriptor: InboundMediaDescriptor,
): Promise<string | null> {
  const bytes = await downloadWhatsAppInboundMedia(descriptor);
  if (!bytes?.length) return null;

  const ext = extensionForMime(descriptor.mimeType, descriptor.filename);
  return savePrivateBookingMedia(bytes, "whatsapp-inbox", ext);
}
