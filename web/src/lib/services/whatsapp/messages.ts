import prisma from "@/lib/prisma";

export async function saveWhatsAppOutboundMessage(opts: {
  bookingId?: number | null;
  phone: string;
  messageType: "text" | "document" | "template";
  body?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  metaMessageId?: string | null;
  status?: "sent" | "failed";
  error?: string | null;
  isAutomated?: boolean;
}) {
  return prisma.whatsAppMessage.create({
    data: {
      bookingId: opts.bookingId ?? null,
      phone: opts.phone,
      messageType: opts.messageType,
      body: opts.body ?? null,
      mediaUrl: opts.mediaUrl ?? null,
      filename: opts.filename ?? null,
      metaMessageId: opts.metaMessageId ?? null,
      status: opts.status ?? (opts.error ? "failed" : "sent"),
      error: opts.error ?? null,
      isAutomated: opts.isAutomated ?? false,
    },
  });
}
