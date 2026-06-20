import { normalizeIndianPhone } from "@/lib/phone";

/** @deprecated Use normalizeIndianPhone from @/lib/phone */
export function normalizeSmsPhone(phone: string): string | null {
  return normalizeIndianPhone(phone);
}
export type TwilioSendResult =
  | { ok: true; sid: string }
  | { ok: false; error: string; skipped?: boolean };

export async function sendTwilioSms(to: string, body: string): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "Twilio is not configured (missing env vars).", skipped: true };
  }

  const toE164 = normalizeSmsPhone(to);
  if (!toE164) {
    return { ok: false, error: `Invalid phone number: ${to}` };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: toE164, From: from, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    return { ok: false, error: data.message || `Twilio HTTP ${res.status}` };
  }

  return { ok: true, sid: data.sid || "unknown" };
}
