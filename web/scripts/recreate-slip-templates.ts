/**
 * Delete PENDING slip templates and recreate with PDF-first message bodies.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  let k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[k] = v;
}

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
const VER = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
const LANG = "en";
const PUBLIC_BASE = (process.env.WHATSAPP_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const FOOTER = "BY TEAM FANCY COLLECTION — RENU AGARWAL";
const THANK = "Thank you for choosing Fancy Collection by Renu Agarwal.";

const REPLACE_NAMES = new Set([
  "booking_confirmation",
  "delivery_slip",
  "return_slip",
  "incomplete_return_slip",
  "booking_postponed",
  "postponement_held",
  "return_reminder",
]);

async function api(method: string, pathUrl: string, body?: unknown) {
  const res = await fetch(`https://graph.facebook.com/${VER}/${pathUrl}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function uploadSamplePdf(): Promise<string | null> {
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) return null;
  const pdf = Buffer.from(`%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 72 720 Td (Sample slip) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000362 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF
`);

  for (const owner of [appId, WABA]) {
    const session = await api(
      "POST",
      `${owner}/uploads?file_length=${pdf.length}&file_type=application/pdf&file_name=slip_sample.pdf`,
      {},
    );
    const sessionId = session.data?.id;
    if (!sessionId) continue;
    const up = await fetch(`https://graph.facebook.com/${VER}/${sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/octet-stream",
        file_offset: "0",
      },
      body: pdf,
    });
    const upData = await up.json();
    if (upData?.h) return upData.h as string;
  }
  return null;
}

async function main() {
  const listed = await api(
    "GET",
    `${WABA}/message_templates?fields=name,status,language,id,components&limit=100`,
  );
  const templates = listed.data?.data || [];
  console.log(
    "Existing:",
    templates.map((t: { name: string; status: string }) => `${t.name}:${t.status}`).join(", "),
  );

  for (const t of templates) {
    if (!REPLACE_NAMES.has(t.name)) continue;
    if (t.language !== LANG && !String(t.language).startsWith(LANG)) continue;
    console.log("DELETE", t.name, t.status, t.id);
    // Meta: DELETE /{waba}/message_templates?hsm_id={id}&name={name}
    const del = await api(
      "DELETE",
      `${WABA}/message_templates?hsm_id=${encodeURIComponent(t.id)}&name=${encodeURIComponent(t.name)}`,
    );
    console.log("  ->", JSON.stringify(del.data));
    await new Promise((r) => setTimeout(r, 400));
  }

  const handle = await uploadSamplePdf();
  console.log("PDF_HANDLE", handle ? "ok" : "missing — will use URL fallback for docs");

  const defs: Array<{
    name: string;
    kind: "document" | "text";
    body: string;
    example: string[];
    urlPath?: string;
    buttonText?: string;
  }> = [
    {
      name: "booking_confirmation",
      kind: "document",
      body:
        `${THANK}\n\n*Booking Confirmed*\n\n` +
        `Serial No: {{1}}\nDate of Pickup: {{2}}\nTime of Pickup: {{3}}\n` +
        `Date & Time of Return: {{4}}\nTotal Dresses: {{5}}`,
      example: ["20", "11 Jul 2026", "11:00 AM", "14 Jul 2026, 06:00 PM", "3"],
      urlPath: "/api/public/booking-slip/{{1}}",
      buttonText: "View booking slip",
    },
    {
      name: "delivery_slip",
      kind: "document",
      body:
        `${THANK}\n\n*Delivered Successfully*\n\nYour booking has been delivered successfully.\n\n` +
        `Serial No: {{1}}\nDelivery Date: {{2}}\nDelivery Time: {{3}}\n` +
        `Return Date & Time: {{4}}\nTotal Dresses: {{5}}`,
      example: ["20", "11 Jul 2026", "11:00 AM", "14 Jul 2026, 06:00 PM", "3"],
      urlPath: "/api/public/slip/delivery/{{1}}",
      buttonText: "View delivery slip",
    },
    {
      name: "return_slip",
      kind: "document",
      body:
        `${THANK}\n\n*Return Completed*\n\nYour return has been processed successfully.\n\n` +
        `Serial No: {{1}}\nReturn Date & Time: {{2}}\nTotal Dresses Returned: {{3}}`,
      example: ["20", "14 Jul 2026, 06:00 PM", "3"],
      urlPath: "/api/public/slip/return/{{1}}",
      buttonText: "View return slip",
    },
    {
      name: "incomplete_return_slip",
      kind: "document",
      body:
        `${THANK}\n\n*Incomplete Return Notice*\n\n` +
        `Some item(s) for your booking were not fully returned. Please contact us to resolve this.\n\n` +
        `Serial No: {{1}}\nReturn Date: {{2}}\nItems Pending: {{3}}`,
      example: ["20", "14 Jul 2026", "2"],
      urlPath: "/api/public/slip/incomplete/{{1}}",
      buttonText: "View notice",
    },
    {
      name: "booking_postponed",
      kind: "text",
      body:
        `${THANK}\n\n*Booking Dates Updated*\n\n` +
        `Serial No / Booking: {{1}}\nNew Delivery: {{2}}\nNew Return: {{3}}\n\n` +
        `Please contact us if you have any questions.`,
      example: ["BK-000001 / 20", "15 Jul 2026", "18 Jul 2026"],
    },
    {
      name: "postponement_held",
      kind: "text",
      body:
        `${THANK}\n\n*Booking Postponed*\n\n` +
        `Serial No / Booking: {{1}}\nScheduled Delivery: {{2}}\nScheduled Return: {{3}}\n\n` +
        `Your advance is held with us. Please contact us when you are ready to reschedule.`,
      example: ["BK-000001 / 20", "20 Jul 2026", "23 Jul 2026"],
    },
    {
      name: "return_reminder",
      kind: "text",
      body:
        `${THANK}\n\n*Return Reminder*\n\n` +
        `Serial No / Booking: {{1}}\nReturn Due: {{2}}\n\n` +
        `Please return on time to avoid late charges.`,
      example: ["BK-000001 / 20", "18 Jul 2026, 06:00 PM"],
    },
  ];

  for (const def of defs) {
    let components: unknown[];
    if (def.kind === "document" && handle) {
      components = [
        { type: "HEADER", format: "DOCUMENT", example: { header_handle: [handle] } },
        { type: "BODY", text: def.body, example: { body_text: [def.example] } },
        { type: "FOOTER", text: FOOTER },
      ];
    } else if (def.kind === "document" && PUBLIC_BASE && def.urlPath && def.buttonText) {
      components = [
        {
          type: "BODY",
          text: def.body + `\n\nTap the button below to open your slip PDF.`,
          example: { body_text: [def.example] },
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
      ];
    } else {
      components = [
        { type: "BODY", text: def.body, example: { body_text: [def.example] } },
        { type: "FOOTER", text: FOOTER },
      ];
    }

    const created = await api("POST", `${WABA}/message_templates`, {
      name: def.name,
      language: LANG,
      category: "UTILITY",
      allow_category_change: true,
      components,
    });
    console.log(
      created.data?.error
        ? `ERR ${def.name}: ${created.data.error.message || created.data.error.error_user_msg}`
        : `OK  ${def.name}: ${created.data.status || "PENDING"} (${handle && def.kind === "document" ? "DOCUMENT" : def.kind})`,
    );
    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
