import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  bookingBillTemplateLanguage,
  bookingBillTemplateName,
  ensureBookingBillTemplate,
} from "@/lib/services/whatsapp/bookingBillTemplate";
import { graphApiVersion } from "@/lib/services/whatsapp/metaApi";

/** Owner-only: report booking bill template status (does not create). */
export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const name = bookingBillTemplateName();
  const language = bookingBillTemplateLanguage();
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return jsonError("WhatsApp credentials not configured", 500);
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
        `?fields=name,status,category,language&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json()) as {
      data?: Array<{ name: string; status: string; language: string; id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return jsonError(data.error?.message || "Meta API error", 500);
    }
    const match = (data.data || []).find(
      (t) => t.name === name && (t.language === language || t.language?.startsWith(language)),
    );
    return jsonOk({
      name,
      language,
      configured: Boolean(match),
      status: match?.status ?? null,
      id: match?.id ?? null,
      ready: match?.status === "APPROVED",
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to check template", 500);
  }
}

/** Owner-only: create/submit the booking_confirmation DOCUMENT template to Meta. */
export async function POST(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const result = await ensureBookingBillTemplate();
    if (!result.ok) {
      return jsonError(result.error || "Failed to submit booking bill template", 500);
    }
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to submit template", 500);
  }
}
