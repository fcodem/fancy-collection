/**
 * Submit sale_1 (image) + sale_project (text) marketing templates to Meta.
 * Usage: npx tsx scripts/submit-sale-templates.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, "..", envFile);
  if (!fs.existsSync(envPath)) continue;
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
    if (!process.env[key]) process.env[key] = val;
  }
}

async function uploadHeaderHandle(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const { uploadTemplateMediaHandle } = await import("../src/lib/services/whatsapp/metaApi");
  return uploadTemplateMediaHandle(fileBuffer, filename, mimeType);
}

async function createTemplate(payload: Record<string, unknown>) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${wabaid}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
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

async function templateExists(name: string, language: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  let url: string | null =
    `https://graph.facebook.com/${version}/${wabaid}/message_templates` +
    `?fields=name,status,language&limit=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json()) as {
      data?: Array<{ name: string; status: string; language: string }>;
      paging?: { next?: string };
    };
    const hit = (data.data || []).find(
      (t) => t.name === name && (t.language === language || t.language?.startsWith(language)),
    );
    if (hit) return hit;
    url = data.paging?.next || null;
  }
  return null;
}

async function main() {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    console.error("Missing WhatsApp credentials");
    process.exit(1);
  }

  const language = process.env.WA_TEMPLATE_SLIPS_LANG?.trim() || "en";
  const {
    buildSale1TemplateComponents,
    buildSale1ImageOnlyTemplateComponents,
    sale1FlyerBuffer,
  } = await import("../src/lib/services/whatsapp/sale1TemplateCopy");
  const { buildSaleProjectTemplateComponents } = await import(
    "../src/lib/services/whatsapp/saleProjectTemplateCopy"
  );

  for (const name of ["sale_1", "sale_1_image", "sale_project"] as const) {
    const existing = await templateExists(name, language);
    if (existing) {
      console.log(name, "already exists:", existing.status, existing.language);
      continue;
    }

    if (name === "sale_1" || name === "sale_1_image") {
      const buffer = sale1FlyerBuffer();
      console.log(name, "uploading flyer", buffer.length, "bytes");
      const uploaded = await uploadHeaderHandle(buffer, `${name}_flyer.png`, "image/png");
      if (!uploaded.ok) {
        console.error(name, "media upload failed:", uploaded.error);
        continue;
      }
      const created = await createTemplate({
        name,
        language,
        category: "MARKETING",
        allow_category_change: true,
        components:
          name === "sale_1_image"
            ? buildSale1ImageOnlyTemplateComponents(uploaded.handle)
            : buildSale1TemplateComponents(uploaded.handle),
      });
      console.log(name, created);
    } else {
      const created = await createTemplate({
        name,
        language,
        category: "MARKETING",
        allow_category_change: true,
        components: buildSaleProjectTemplateComponents(),
      });
      console.log(name, created);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
