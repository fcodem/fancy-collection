/**
 * Submit booking_confirmation + all slip/utility + marketing templates to Meta.
 * Loads credentials from .env.local (current WABA).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  let k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
const VER = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
const LANG = process.env.WA_TEMPLATE_BOOKING_BILL_LANG?.trim() || "en";
const PUBLIC_BASE = (process.env.WHATSAPP_PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const FOOTER = "TEAM FANCY COLLECTION -RENU AGARWAL";

type Def = {
  name: string;
  category: "UTILITY" | "MARKETING";
  kind: "url" | "text";
  body: string;
  bodyExample: string[];
  buttonText?: string;
  urlPath?: string;
};

const DEFS: Def[] = [
  {
    name: "booking_confirmation",
    category: "UTILITY",
    kind: "url",
    body:
      `Dear {{1}},\n\n` +
      `Your booking (#{{2}}) has been confirmed. Tap the button below to open your booking slip PDF ` +
      `(outfit details, QR code, and terms & conditions).\n\n` +
      `We look forward to serving you.`,
    bodyExample: ["Customer Name", "18"],
    buttonText: "View booking slip",
    urlPath: "/api/public/booking-slip/{{1}}",
  },
  {
    name: "delivery_slip",
    category: "UTILITY",
    kind: "url",
    body:
      `Dear {{1}},\n\n` +
      `Your outfit(s) for booking {{2}} have been delivered. ` +
      `Tap below to open your delivery slip PDF.\n\n` +
      `Thank you for choosing us.`,
    bodyExample: ["Customer Name", "BK-000001"],
    buttonText: "View delivery slip",
    urlPath: "/api/public/slip/delivery/{{1}}",
  },
  {
    name: "return_slip",
    category: "UTILITY",
    kind: "url",
    body:
      `Dear {{1}},\n\n` +
      `Your return for booking {{2}} has been processed. ` +
      `Tap below to open your return slip PDF.`,
    bodyExample: ["Customer Name", "BK-000001"],
    buttonText: "View return slip",
    urlPath: "/api/public/slip/return/{{1}}",
  },
  {
    name: "incomplete_return_slip",
    category: "UTILITY",
    kind: "url",
    body:
      `Dear {{1}},\n\n` +
      `Some item(s) for booking {{2}} were not fully returned. ` +
      `Tap below to open the incomplete return notice PDF. Please contact us to resolve this.`,
    bodyExample: ["Customer Name", "BK-000001"],
    buttonText: "View notice",
    urlPath: "/api/public/slip/incomplete/{{1}}",
  },
  {
    name: "booking_postponed",
    category: "UTILITY",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Your booking {{2}} dates have been updated.\n\n` +
      `New delivery: {{3}}\n` +
      `New return: {{4}}\n\n` +
      `Please contact us if you have any questions.`,
    bodyExample: ["Customer Name", "BK-000001", "15 Jul 2026", "18 Jul 2026"],
  },
  {
    name: "postponement_held",
    category: "UTILITY",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Your booking {{2}} has been postponed.\n\n` +
      `Scheduled delivery: {{3}}\n` +
      `Scheduled return: {{4}}\n\n` +
      `Your advance is held with us. Please contact us when you are ready to reschedule.`,
    bodyExample: ["Customer Name", "BK-000001", "20 Jul 2026", "23 Jul 2026"],
  },
  {
    name: "return_reminder",
    category: "UTILITY",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Reminder: your rental {{2}} is due for return on {{3}}. ` +
      `Please return on time to avoid late charges.`,
    bodyExample: ["Customer Name", "BK-000001", "18 Jul 2026"],
  },
  // Marketing
  {
    name: "festive_offer",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Celebrate with Fancy Collection by Renu Agarwal! ` +
      `Explore our latest bridal and festive rentals. Reply to this message or call us to book your look.`,
    bodyExample: ["Customer Name"],
  },
  {
    name: "new_collection",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `New arrivals are in at Fancy Collection by Renu Agarwal. ` +
      `Visit us or reply on WhatsApp to reserve your favourite outfit.`,
    bodyExample: ["Customer Name"],
  },
  {
    name: "wedding_season_offer",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Wedding season specials are live at Fancy Collection by Renu Agarwal. ` +
      `Book early for bridal lehengas, sherwanis, and jewellery sets. Reply YES to get availability.`,
    bodyExample: ["Customer Name"],
  },
  {
    name: "customer_thank_you",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Thank you for choosing Fancy Collection by Renu Agarwal. ` +
      `We hope you loved your look. Reply anytime to book again or refer a friend.`,
    bodyExample: ["Customer Name"],
  },
];

async function listTemplates() {
  const res = await fetch(
    `https://graph.facebook.com/${VER}/${WABA}/message_templates?fields=name,status,language&limit=100`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `List HTTP ${res.status}`);
  return (data.data || []) as Array<{ name: string; status: string; language: string }>;
}

async function createTemplate(payload: Record<string, unknown>) {
  const res = await fetch(
    `https://graph.facebook.com/${VER}/${WABA}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true as const, id: data.id as string | undefined, status: (data.status as string) || "PENDING" };
}

async function ensureOne(def: Def, existing: Array<{ name: string; status: string; language: string }>) {
  const found = existing.find(
    (t) => t.name === def.name && (t.language === LANG || t.language?.startsWith(LANG)),
  );
  if (found) {
    return {
      name: def.name,
      category: def.category,
      ok: true,
      created: false,
      status: found.status,
      message: `Already exists (${found.status})`,
    };
  }

  if (def.kind === "url") {
    if (!PUBLIC_BASE) {
      return {
        name: def.name,
        category: def.category,
        ok: false,
        created: false,
        error: "WHATSAPP_PUBLIC_BASE_URL missing",
      };
    }
    const created = await createTemplate({
      name: def.name,
      language: LANG,
      category: def.category,
      allow_category_change: true,
      components: [
        {
          type: "BODY",
          text: def.body,
          example: { body_text: [def.bodyExample] },
        },
        { type: "FOOTER", text: FOOTER },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: def.buttonText,
              url: `${PUBLIC_BASE}${def.urlPath}`,
              example: ["BK-000001"],
            },
          ],
        },
      ],
    });
    if (!created.ok) {
      return { name: def.name, category: def.category, ok: false, created: false, error: created.error };
    }
    return {
      name: def.name,
      category: def.category,
      ok: true,
      created: true,
      status: created.status,
      message: "Submitted for approval",
    };
  }

  const created = await createTemplate({
    name: def.name,
    language: LANG,
    category: def.category,
    allow_category_change: true,
    components: [
      {
        type: "BODY",
        text: def.body,
        example: { body_text: [def.bodyExample] },
      },
      { type: "FOOTER", text: FOOTER },
    ],
  });
  if (!created.ok) {
    return { name: def.name, category: def.category, ok: false, created: false, error: created.error };
  }
  return {
    name: def.name,
    category: def.category,
    ok: true,
    created: true,
    status: created.status,
    message: "Submitted for approval",
  };
}

async function main() {
  console.log("WABA", WABA);
  console.log("PUBLIC_BASE", PUBLIC_BASE || "(missing)");
  console.log("LANG", LANG);

  let existing = await listTemplates();
  console.log(
    "Existing:",
    existing.map((t) => `${t.name}|${t.language}|${t.status}`).join(", ") || "(none)",
  );

  const results = [];
  for (const def of DEFS) {
    const r = await ensureOne(def, existing);
    results.push(r);
    console.log(
      r.ok
        ? `OK  ${def.name} [${def.category}] ${r.created ? "CREATED" : "SKIP"} ${r.status || ""} ${r.message || ""}`
        : `ERR ${def.name} [${def.category}] ${r.error}`,
    );
    // refresh list after creates so duplicates aren't attempted
    if (r.created) {
      existing = await listTemplates();
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
