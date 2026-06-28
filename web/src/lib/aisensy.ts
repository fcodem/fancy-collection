import { aisensyCsvPhone } from "@/lib/phone";

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export type AisensySendResult =
  | { ok: true; messageId?: string; raw?: unknown }
  | { ok: false; error: string; skipped?: boolean };

export function isAisensyConfigured(): boolean {
  return Boolean(process.env.AISENSY_API_KEY?.trim());
}

export function aisensyProjectId(): string | undefined {
  return process.env.AISENSY_PROJECT_ID?.trim() || undefined;
}

export function aisensyCampaign(type: "booking" | "prospect" | "return" | "default"): string | undefined {
  const map: Record<string, string | undefined> = {
    booking: process.env.AISENSY_CAMPAIGN_BOOKING,
    prospect: process.env.AISENSY_CAMPAIGN_PROSPECT,
    return: process.env.AISENSY_CAMPAIGN_RETURN,
    default: process.env.AISENSY_CAMPAIGN_DEFAULT,
  };
  return map[type]?.trim() || map.default?.trim() || undefined;
}

export async function sendAisensyCampaign(opts: {
  campaignName: string;
  phone: string;
  userName: string;
  templateParams?: string[];
  source?: string;
  tags?: string[];
}): Promise<AisensySendResult> {
  const apiKey = process.env.AISENSY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "AiSensy API key is not configured.", skipped: true };
  }

  const destination = aisensyCsvPhone(opts.phone);
  if (!destination) {
    return { ok: false, error: `Invalid phone number: ${opts.phone}` };
  }

  const body: Record<string, unknown> = {
    apiKey,
    campaignName: opts.campaignName,
    destination,
    userName: opts.userName || "Customer",
    source: opts.source || process.env.AISENSY_SOURCE || "fancy-collection-web",
  };

  if (opts.templateParams?.length) body.templateParams = opts.templateParams;
  if (opts.tags?.length) body.tags = opts.tags;

  try {
    const res = await fetch(AISENSY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      success?: boolean;
      id?: string;
      messageId?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: raw.message || raw.error || `AiSensy HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: raw.messageId || raw.id,
      raw,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AiSensy request failed",
    };
  }
}
