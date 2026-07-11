/**
 * One-shot: delete obsolete Meta WhatsApp templates (keeps *_v3 + marketing).
 * Usage: npx tsx scripts/cleanup-legacy-whatsapp-templates.ts [--dry-run]
 */
import fs from "fs";
import path from "path";
import {
  ACTIVE_WHATSAPP_TEMPLATE_NAMES,
  isLegacyWhatsAppTemplateName,
  LEGACY_WHATSAPP_TEMPLATE_NAMES,
} from "../src/lib/services/whatsapp/legacyTemplates";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const ver = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();

if (!token || !wabaid) {
  console.error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID");
  process.exit(1);
}

async function main() {
  const res = await fetch(
    `https://graph.facebook.com/${ver}/${wabaid}/message_templates?fields=name,status,language&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    data?: Array<{ name: string; status?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `List HTTP ${res.status}`);

  const listed = data.data || [];
  const onMeta = new Set(listed.map((t) => t.name.toLowerCase()));
  const candidates = [
    ...new Set([
      ...LEGACY_WHATSAPP_TEMPLATE_NAMES.map((n) => n.toLowerCase()),
      ...listed.map((t) => t.name.toLowerCase()).filter(isLegacyWhatsAppTemplateName),
    ]),
  ].filter((n) => !ACTIVE_WHATSAPP_TEMPLATE_NAMES.has(n) && onMeta.has(n));

  console.log(`On Meta: ${listed.length} templates`);
  console.log(`Would delete (${candidates.length}):`, candidates);
  console.log("Keep:", [...ACTIVE_WHATSAPP_TEMPLATE_NAMES]);

  if (dryRun || candidates.length === 0) {
    console.log(dryRun ? "Dry run only." : "Nothing to delete.");
    return;
  }

  for (const name of candidates) {
    const del = await fetch(
      `https://graph.facebook.com/${ver}/${wabaid}/message_templates?name=${encodeURIComponent(name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await del.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string; error_user_msg?: string };
    };
    if (!del.ok) {
      console.error(
        `FAIL ${name}:`,
        body.error?.error_user_msg || body.error?.message || del.status,
      );
    } else {
      console.log(`DELETED ${name}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
