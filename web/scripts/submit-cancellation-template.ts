/**
 * Submit booking_cancelled_v1 cancellation notice template to Meta.
 *
 * Usage (from web/):
 *   npx tsx scripts/submit-cancellation-template.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CANCELLATION_NOTICE_TEMPLATE_BODY,
  CANCELLATION_NOTICE_TEMPLATE_EXAMPLE,
  SLIP_WA_FOOTER,
} from "../src/lib/services/whatsapp/slipMessageCopy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
const VER = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
const name = process.env.WA_TEMPLATE_CANCELLATION?.trim().toLowerCase() || "booking_cancelled_v1";
const language = process.env.WA_TEMPLATE_SLIPS_LANG?.trim() || "en";

async function listTemplates() {
  const res = await fetch(
    `https://graph.facebook.com/${VER}/${WABA}/message_templates?fields=name,status,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const data = (await res.json()) as {
    data?: Array<{ name: string; status: string; language: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `List HTTP ${res.status}`);
  return (data.data || []).find(
    (t) =>
      t.name === name &&
      (t.language === language || t.language?.startsWith(language.split("_")[0] || language)),
  );
}

async function createTemplate() {
  const res = await fetch(`https://graph.facebook.com/${VER}/${WABA}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      language,
      category: "UTILITY",
      allow_category_change: true,
      components: [
        {
          type: "BODY",
          text: CANCELLATION_NOTICE_TEMPLATE_BODY,
          example: { body_text: [CANCELLATION_NOTICE_TEMPLATE_EXAMPLE] },
        },
        { type: "FOOTER", text: SLIP_WA_FOOTER },
      ],
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true as const, id: data.id, status: data.status || "PENDING" };
}

async function main() {
  if (!TOKEN || !WABA) {
    console.error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in .env.local");
    process.exit(1);
  }

  console.log("Template name:", name);
  console.log("Language:", language);
  console.log("WABA:", WABA);
  console.log("Phone ID:", process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "(missing)");

  const existing = await listTemplates();
  if (existing) {
    console.log("\nAlready on Meta:", JSON.stringify(existing, null, 2));
    return;
  }

  const created = await createTemplate();
  console.log("\nSubmit result:", JSON.stringify(created, null, 2));

  const after = await listTemplates();
  console.log("\nVerified on Meta:", JSON.stringify(after ?? null, null, 2));

  if (!created.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
