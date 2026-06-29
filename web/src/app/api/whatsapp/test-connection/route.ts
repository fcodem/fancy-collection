import { NextRequest } from "next/server";
import { requireOwner, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v19.0";
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();

  const envCheck = {
    WHATSAPP_ACCESS_TOKEN: token ? "✅ Set" : "❌ Missing",
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId ? "✅ Set" : "❌ Missing",
    WHATSAPP_BUSINESS_ACCOUNT_ID: businessId ? "✅ Set" : "❌ Missing",
    WHATSAPP_API_VERSION: apiVersion,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      ? "✅ Set"
      : "❌ Missing",
    WA_TEMPLATE_BOOKING_BILL: process.env.WA_TEMPLATE_BOOKING_BILL || "❌ Missing",
    WA_TEMPLATE_BOOKING_REMINDER:
      process.env.WA_TEMPLATE_BOOKING_REMINDER || "❌ Missing",
    WA_TEMPLATE_POSTPONEMENT: process.env.WA_TEMPLATE_POSTPONEMENT || "❌ Missing",
    ABLY_API_KEY: process.env.ABLY_API_KEY ? "✅ Set" : "❌ Missing",
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? "✅ Set" : "❌ Missing",
  };

  if (!token || !phoneNumberId) {
    return Response.json({
      ok: false,
      stage: "env_check",
      message: "Missing required credentials in .env.local",
      envCheck,
    });
  }

  let metaApiCheck: {
    ok: boolean;
    status?: number;
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    error?: string;
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}` +
        `?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    const data = (await res.json()) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message: string; code: number; type: string };
    };

    if (!res.ok || data.error) {
      metaApiCheck = {
        ok: false,
        status: res.status,
        error: data.error?.message || `HTTP ${res.status}`,
      };
    } else {
      metaApiCheck = {
        ok: true,
        status: res.status,
        phoneNumberId,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
      };
    }
  } catch (e) {
    metaApiCheck = {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  let businessCheck: {
    ok: boolean;
    businessAccountId?: string;
    name?: string;
    error?: string;
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${businessId}` +
        `?fields=name,currency,timezone_id`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    const data = (await res.json()) as {
      id?: string;
      name?: string;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      businessCheck = {
        ok: false,
        error: data.error?.message || `HTTP ${res.status}`,
      };
    } else {
      businessCheck = {
        ok: true,
        businessAccountId: businessId,
        name: data.name,
      };
    }
  } catch (e) {
    businessCheck = {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  const allGood = metaApiCheck.ok && businessCheck.ok;

  return Response.json({
    ok: allGood,
    summary: allGood
      ? "✅ All checks passed. Meta WhatsApp API is connected."
      : "❌ Some checks failed. See details below.",
    envCheck,
    metaApiCheck,
    businessCheck,
    nextSteps: allGood
      ? [
          "Your permanent token is working correctly.",
          "Next: Set up webhook URL in Meta Dashboard (Step 7).",
          "Delete this test route before going to production.",
        ]
      : [
          "Fix the failed checks above.",
          "Make sure your token is the permanent system user token.",
          "Make sure WHATSAPP_PHONE_NUMBER_ID is correct.",
          "Try regenerating the token in Meta Business Manager.",
        ],
  });
}
