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
  const metaAppId = process.env.META_APP_ID?.trim();

  const envCheck = {
    META_APP_ID: metaAppId ? `✅ ${metaAppId}` : "❌ Missing",
    WHATSAPP_ACCESS_TOKEN: token ? "✅ Set" : "❌ Missing",
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId ? "✅ Set" : "❌ Missing",
    WHATSAPP_BUSINESS_ACCOUNT_ID: businessId ? "✅ Set" : "❌ Missing",
    WHATSAPP_API_VERSION: apiVersion,
    META_APP_SECRET: process.env.META_APP_SECRET ? "✅ Set" : "❌ Missing",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      ? "✅ Set"
      : "❌ Missing",
    WA_TEMPLATE_BOOKING_BILL: process.env.WA_TEMPLATE_BOOKING_BILL || "❌ Missing",
    WA_TEMPLATE_BOOKING_REMINDER:
      process.env.WA_TEMPLATE_BOOKING_REMINDER || "❌ Missing",
    WA_TEMPLATE_POSTPONEMENT: process.env.WA_TEMPLATE_POSTPONEMENT || "❌ Missing",
  };

  const optionalEnvCheck = {
    ABLY_API_KEY: process.env.ABLY_API_KEY
      ? "✅ Set"
      : "Optional — live inbox updates only",
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN
      ? "✅ Set"
      : "Optional — cloud PDF storage only",
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
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      const expired = /session has expired|access token.*expir|error validating access token/i.test(
        errMsg,
      );
      metaApiCheck = {
        ok: false,
        status: res.status,
        error: expired
          ? `Access token expired — replace WHATSAPP_ACCESS_TOKEN with a permanent System User token, then restart. (${errMsg})`
          : errMsg,
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

  let appCheck: {
    ok: boolean;
    optional?: boolean;
    appId?: string;
    name?: string;
    error?: string;
    note?: string;
  } = { ok: false, optional: true, error: "META_APP_ID not set" };

  if (metaAppId && token) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${metaAppId}?fields=name`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const data = (await res.json()) as {
        name?: string;
        error?: { message: string };
      };
      if (!res.ok || data.error) {
        // System User tokens often cannot read the App object — this does not block WhatsApp sends.
        appCheck = {
          ok: true,
          optional: true,
          appId: metaAppId,
          name: metaAppId,
          note:
            "App ID is set. Graph App lookup is optional and often blocked for System User tokens — ignore if Phone + Business are green.",
        };
      } else {
        appCheck = { ok: true, optional: true, appId: metaAppId, name: data.name };
      }
    } catch (e) {
      appCheck = {
        ok: true,
        optional: true,
        appId: metaAppId,
        name: metaAppId,
        note:
          "App ID is set. Could not look up app name (optional). WhatsApp still works if Phone + Business are green.",
        error: e instanceof Error ? e.message : "Network error",
      };
    }
  }

  let businessCheck: {
    ok: boolean;
    businessAccountId?: string;
    name?: string;
    error?: string;
  };

  if (!businessId) {
    businessCheck = { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID not set" };
  } else {
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
  }

  // Phone + Business are the real readiness checks. App Graph lookup is optional.
  const allGood = metaApiCheck.ok && businessCheck.ok;

  return Response.json({
    ok: allGood,
    summary: allGood
      ? "✅ WhatsApp is connected and ready to send messages."
      : "❌ Some required checks failed. See details below.",
    envCheck,
    optionalEnvCheck,
    appCheck: metaAppId ? appCheck : undefined,
    metaApiCheck,
    businessCheck,
    nextSteps: allGood
      ? [
          "Phone number and Business account verified — you can send WhatsApp messages.",
          "If webhook is not verified yet: use your live ngrok/public HTTPS URL + WHATSAPP_WEBHOOK_VERIFY_TOKEN.",
          "ABLY and BLOB tokens are optional extras (live inbox / cloud PDFs), not required for sending.",
        ]
      : [
          "Fix the failed Phone or Business checks above.",
          "If the error says Session has expired: generate a new token in Meta Business Settings → System Users → Generate token (whatsapp_business_messaging + whatsapp_business_management), paste into WHATSAPP_ACCESS_TOKEN, restart Next.js.",
          "Prefer a permanent System User token — temporary user tokens expire in hours/days and stop all booking bills.",
          "Confirm WHATSAPP_PHONE_NUMBER_ID=1123209344217445 and WABA=1677277896836530 still match Meta API Setup.",
          "After updating the token, open the failed booking and use Send WhatsApp / resend bill.",
        ],
  });
}
