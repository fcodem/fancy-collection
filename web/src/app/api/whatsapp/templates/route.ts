import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";

type MetaTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
};

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  if (!token || !wabaid) {
    return jsonError("WhatsApp credentials not configured", 500);
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${wabaid}/message_templates` +
        `?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = (await res.json()) as {
      data?: MetaTemplate[];
      error?: { message: string };
    };

    if (!res.ok) {
      return jsonError(data.error?.message || "Meta API error", 500);
    }

    return jsonOk({ templates: data.data || [] });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to fetch templates", 500);
  }
}
