/**
 * Submit customer_welcome_v1 (Maps + Instagram URL buttons) to Meta for approval.
 *
 * Usage (from web/):
 *   npx tsx scripts/submit-customer-welcome-template.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildCustomerWelcomeTemplateComponents,
  customerWelcomeTemplateLanguage,
  customerWelcomeTemplateName,
} from "../src/lib/services/whatsapp/welcomeTemplateCopy";
import { getWhatsAppBotSettingsDefaults } from "../src/lib/services/whatsapp/botSettings";

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

async function listTemplates(name: string, language: string) {
  const res = await fetch(
    `https://graph.facebook.com/${VER}/${WABA}/message_templates?fields=name,status,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const data = (await res.json()) as {
    data?: Array<{ name: string; status: string; language: string; components?: unknown[] }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `List HTTP ${res.status}`);
  return (data.data || []).find(
    (t) =>
      t.name === name &&
      (t.language === language || t.language?.startsWith(language.split("_")[0] || language)),
  );
}

async function createTemplate(payload: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/${VER}/${WABA}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

  const settings = getWhatsAppBotSettingsDefaults();
  const name = customerWelcomeTemplateName();
  const language = customerWelcomeTemplateLanguage();

  console.log("Template name:", name);
  console.log("Language:", language);
  console.log("WABA:", WABA);
  console.log("Phone ID:", process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "(missing)");

  const existing = await listTemplates(name, language);
  if (existing) {
    console.log("\nAlready on Meta:", JSON.stringify({
      name: existing.name,
      status: existing.status,
      language: existing.language,
    }, null, 2));
    return;
  }

  const created = await createTemplate({
    name,
    language,
    category: "UTILITY",
    allow_category_change: true,
    components: buildCustomerWelcomeTemplateComponents(settings),
  });

  console.log("\nSubmit result:", JSON.stringify(created, null, 2));

  const after = await listTemplates(name, language);
  console.log("\nVerified on Meta:", JSON.stringify(after ? {
    name: after.name,
    status: after.status,
    language: after.language,
    buttonCount: (after.components as Array<{ type: string; buttons?: unknown[] }> | undefined)
      ?.find((c) => c.type === "BUTTONS")?.buttons?.length ?? 0,
  } : null, null, 2));

  if (!created.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
