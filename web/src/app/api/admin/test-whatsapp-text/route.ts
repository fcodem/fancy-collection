import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { sendWhatsAppText } from "@/lib/services/whatsapp/metaApi";
import { isWhatsAppReceiptsDisabled } from "@/lib/services/whatsapp/metaApi";

/** Owner-only: send a short text to verify WhatsApp delivery. */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  if (isWhatsAppReceiptsDisabled()) {
    return jsonError("WHATSAPP_RECEIPTS_DISABLED is true");
  }

  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || "8077843874").replace(/\D/g, "").slice(-10);
  const text =
    String(body.text || "").trim() ||
    "Test from Fancy Collection — if you see this, WhatsApp delivery to your number is working. Slips are sent as PDF attachments in separate messages.";

  const result = await sendWhatsAppText(phone, text);
  if (!result.ok) return jsonError(result.error || "Send failed", 500);
  return jsonOk({ ok: true, phone, messageId: result.messageId });
}
