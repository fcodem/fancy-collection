import "server-only";

import {
  graphApiVersion,
  sendWhatsAppDocumentTemplate,
  sendWhatsAppTemplate,
  uploadTemplateMediaHandle,
  type WhatsAppSendResult,
} from "./metaApi";
import {
  bookingBillTemplateLanguage,
  isConfiguredPhoneReadyForTemplates,
  sampleBookingSlipPdfBuffer,
  whatsAppPublicBaseUrl,
} from "./bookingBillTemplate";
import {
  DELIVERY_SLIP_TEMPLATE_BODY,
  DELIVERY_SLIP_TEMPLATE_EXAMPLE,
  INCOMPLETE_SLIP_TEMPLATE_BODY,
  INCOMPLETE_SLIP_TEMPLATE_EXAMPLE,
  POSTPONEMENT_DATES_TEMPLATE_BODY,
  POSTPONEMENT_DATES_TEMPLATE_EXAMPLE,
  POSTPONEMENT_HELD_TEMPLATE_BODY,
  POSTPONEMENT_HELD_TEMPLATE_EXAMPLE,
  RETURN_DUE_REMINDER_TEMPLATE_BODY,
  RETURN_DUE_REMINDER_TEMPLATE_EXAMPLE,
  RETURN_SLIP_TEMPLATE_BODY,
  RETURN_SLIP_TEMPLATE_EXAMPLE,
  SLIP_WA_FOOTER,
} from "./slipMessageCopy";

export type SlipTemplateDef = {
  key: string;
  name: string;
  envVar?: string;
  category: "UTILITY" | "MARKETING";
  /** document = PDF header; url = PDF link button; text = body-only */
  kind: "document" | "url" | "text";
  buttonText?: string;
  /** Path after public base, must end with /{{1}} for URL templates */
  urlPath?: string;
  body: string;
  bodyExample: string[];
  footer?: string;
  description: string;
};

const FOOTER = SLIP_WA_FOOTER;

/** All operational + starter marketing templates we manage in Meta. */
export const SLIP_TEMPLATE_DEFS: SlipTemplateDef[] = [
  {
    key: "delivery_slip",
    name: "delivery_slip_v4",
    envVar: "WA_TEMPLATE_DELIVERY_SLIP",
    category: "UTILITY",
    kind: "document",
    buttonText: "View delivery slip",
    urlPath: "/api/public/slip/delivery/{{1}}",
    body: DELIVERY_SLIP_TEMPLATE_BODY,
    bodyExample: DELIVERY_SLIP_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Delivery slip PDF + delivery details",
  },
  {
    key: "return_slip",
    name: "return_slip_v4",
    envVar: "WA_TEMPLATE_RETURN_SLIP",
    category: "UTILITY",
    kind: "document",
    buttonText: "View return slip",
    urlPath: "/api/public/slip/return/{{1}}",
    body: RETURN_SLIP_TEMPLATE_BODY,
    bodyExample: RETURN_SLIP_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Return slip PDF + thank-you / review",
  },
  {
    key: "incomplete_return_slip",
    name: "incomplete_return_v4",
    envVar: "WA_TEMPLATE_INCOMPLETE_SLIP",
    category: "UTILITY",
    kind: "document",
    buttonText: "View notice",
    urlPath: "/api/public/slip/incomplete/{{1}}",
    body: INCOMPLETE_SLIP_TEMPLATE_BODY,
    bodyExample: INCOMPLETE_SLIP_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Incomplete return PDF + notice",
  },
  {
    key: "booking_postponed",
    name: "booking_dates_v3",
    envVar: "WA_TEMPLATE_POSTPONEMENT",
    category: "UTILITY",
    kind: "text",
    body: POSTPONEMENT_DATES_TEMPLATE_BODY,
    bodyExample: POSTPONEMENT_DATES_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Postponement / date change notice",
  },
  {
    key: "postponement_held",
    name: "booking_held_v3",
    envVar: "WA_TEMPLATE_POSTPONEMENT_HELD",
    category: "UTILITY",
    kind: "text",
    body: POSTPONEMENT_HELD_TEMPLATE_BODY,
    bodyExample: POSTPONEMENT_HELD_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Postponement held (advance retained)",
  },
  {
    key: "return_reminder",
    name: "return_due_v3",
    envVar: "WA_TEMPLATE_BOOKING_REMINDER",
    category: "UTILITY",
    kind: "text",
    body: RETURN_DUE_REMINDER_TEMPLATE_BODY,
    bodyExample: RETURN_DUE_REMINDER_TEMPLATE_EXAMPLE,
    footer: FOOTER,
    description: "Return due reminder",
  },
  {
    key: "festive_offer",
    name: "festive_offer",
    envVar: "WA_TEMPLATE_MARKETING_FESTIVE",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Celebrate with Fancy Collection by Renu Agarwal! ` +
      `Explore our latest bridal and festive rentals. Reply to this message or call us to book your look.`,
    bodyExample: ["Customer Name"],
    footer: FOOTER,
    description: "Marketing — festive / seasonal offer",
  },
  {
    key: "new_collection",
    name: "new_collection",
    envVar: "WA_TEMPLATE_MARKETING_COLLECTION",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `New arrivals are in at Fancy Collection by Renu Agarwal. ` +
      `Visit us or reply on WhatsApp to reserve your favourite outfit.`,
    bodyExample: ["Customer Name"],
    footer: FOOTER,
    description: "Marketing — new collection",
  },
  {
    key: "wedding_season_offer",
    name: "wedding_season_offer",
    envVar: "WA_TEMPLATE_MARKETING_WEDDING",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Wedding season specials are live at Fancy Collection by Renu Agarwal. ` +
      `Book early for bridal lehengas, sherwanis, and jewellery sets. Reply YES to get availability.`,
    bodyExample: ["Customer Name"],
    footer: FOOTER,
    description: "Marketing — wedding season offer",
  },
  {
    key: "customer_thank_you",
    name: "customer_thank_you",
    envVar: "WA_TEMPLATE_MARKETING_THANKS",
    category: "MARKETING",
    kind: "text",
    body:
      `Dear {{1}},\n\n` +
      `Thank you for choosing Fancy Collection by Renu Agarwal. ` +
      `We hope you loved your look. Reply anytime to book again or refer a friend.`,
    bodyExample: ["Customer Name"],
    footer: FOOTER,
    description: "Marketing — thank you / rebooking",
  },
];

export function resolveTemplateName(def: SlipTemplateDef): string {
  if (def.envVar) {
    const fromEnv = process.env[def.envVar]?.trim();
    if (fromEnv) return fromEnv.toLowerCase();
  }
  return def.name;
}

export function slipTemplateLanguage(): string {
  return (
    process.env.WA_TEMPLATE_SLIPS_LANG?.trim() ||
    bookingBillTemplateLanguage() ||
    "en"
  );
}

type MetaTemplateListItem = {
  name: string;
  status: string;
  language: string;
  id?: string;
  components?: Array<{ type?: string; format?: string; buttons?: unknown[] }>;
};

async function listTemplates(): Promise<
  { ok: true; templates: MetaTemplateListItem[] } | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }
  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
      `?fields=name,status,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: MetaTemplateListItem[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data.error?.message || `List HTTP ${res.status}` };
  }
  return { ok: true, templates: data.data || [] };
}

async function createTemplate(payload: Record<string, unknown>): Promise<
  { ok: true; id?: string; status?: string } | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!.trim();
  const res = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates`,
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
      ok: false,
      error: data.error?.error_user_msg || data.error?.message || `Create HTTP ${res.status}`,
    };
  }
  return { ok: true, id: data.id, status: data.status || "PENDING" };
}

export type EnsureOneResult = {
  key: string;
  name: string;
  ok: boolean;
  status?: string | null;
  created?: boolean;
  skipped?: boolean;
  error?: string;
  message?: string;
};

export async function ensureSlipTemplate(def: SlipTemplateDef): Promise<EnsureOneResult> {
  const name = resolveTemplateName(def);
  const language = slipTemplateLanguage();
  const listed = await listTemplates();
  if (!listed.ok) {
    return { key: def.key, name, ok: false, error: listed.error };
  }

  const existing = listed.templates.find(
    (t) => t.name === name && (t.language === language || t.language?.startsWith(language)),
  );
  if (existing) {
    return {
      key: def.key,
      name,
      ok: true,
      status: existing.status,
      created: false,
      skipped: true,
      message: `Already exists (${existing.status})`,
    };
  }

  if (def.kind === "document") {
    const handleResult = await uploadTemplateMediaHandle(
      sampleBookingSlipPdfBuffer(),
      `${name}_sample.pdf`,
      "application/pdf",
    );
    if (handleResult.ok) {
      const created = await createTemplate({
        name,
        language,
        category: def.category,
        allow_category_change: true,
        components: [
          {
            type: "HEADER",
            format: "DOCUMENT",
            example: { header_handle: [handleResult.handle] },
          },
          {
            type: "BODY",
            text: def.body,
            example: { body_text: [def.bodyExample] },
          },
          ...(def.footer ? [{ type: "FOOTER", text: def.footer }] : []),
        ],
      });
      if (created.ok) {
        return {
          key: def.key,
          name,
          ok: true,
          status: created.status,
          created: true,
          message: "DOCUMENT template submitted to Meta for approval",
        };
      }
    }

    // Fallback to URL button if DOCUMENT media upload/create fails
    if (def.urlPath && def.buttonText) {
      const publicBase = whatsAppPublicBaseUrl();
      if (publicBase) {
        const urlBody =
          def.body + `\n\nTap the button below to open your slip PDF.`;
        const created = await createTemplate({
          name,
          language,
          category: def.category,
          allow_category_change: true,
          components: [
            {
              type: "BODY",
              text: urlBody,
              example: { body_text: [def.bodyExample] },
            },
            ...(def.footer ? [{ type: "FOOTER", text: def.footer }] : []),
            {
              type: "BUTTONS",
              buttons: [
                {
                  type: "URL",
                  text: def.buttonText,
                  url: `${publicBase}${def.urlPath}`,
                  example: ["BK-000001"],
                },
              ],
            },
          ],
        });
        if (!created.ok) return { key: def.key, name, ok: false, error: created.error };
        return {
          key: def.key,
          name,
          ok: true,
          status: created.status,
          created: true,
          message: "URL fallback template submitted (DOCUMENT upload unavailable)",
        };
      }
    }

    return {
      key: def.key,
      name,
      ok: false,
      error:
        `Could not create DOCUMENT template` +
        (handleResult.ok ? "" : ` (media: ${handleResult.error})`) +
        `. Set WHATSAPP_PUBLIC_BASE_URL for URL fallback.`,
    };
  }

  if (def.kind === "url") {
    const publicBase = whatsAppPublicBaseUrl();
    if (!publicBase || !def.urlPath || !def.buttonText) {
      return {
        key: def.key,
        name,
        ok: false,
        error:
          "WHATSAPP_PUBLIC_BASE_URL (HTTPS) is required to create URL slip templates.",
      };
    }
    const created = await createTemplate({
      name,
      language,
      category: def.category,
      allow_category_change: true,
      components: [
        {
          type: "BODY",
          text: def.body,
          example: { body_text: [def.bodyExample] },
        },
        ...(def.footer ? [{ type: "FOOTER", text: def.footer }] : []),
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: def.buttonText,
              url: `${publicBase}${def.urlPath}`,
              example: ["BK-000001"],
            },
          ],
        },
      ],
    });
    if (!created.ok) return { key: def.key, name, ok: false, error: created.error };
    return {
      key: def.key,
      name,
      ok: true,
      status: created.status,
      created: true,
      message: "Submitted to Meta for approval",
    };
  }

  const created = await createTemplate({
    name,
    language,
    category: def.category,
    allow_category_change: true,
    components: [
      {
        type: "BODY",
        text: def.body,
        example: { body_text: [def.bodyExample] },
      },
      ...(def.footer ? [{ type: "FOOTER", text: def.footer }] : []),
    ],
  });
  if (!created.ok) return { key: def.key, name, ok: false, error: created.error };
  return {
    key: def.key,
    name,
    ok: true,
    status: created.status,
    created: true,
    message: "Submitted to Meta for approval",
  };
}

export async function ensureAllSlipTemplates(opts?: {
  includeMarketing?: boolean;
}): Promise<{ results: EnsureOneResult[]; ok: boolean }> {
  const includeMarketing = opts?.includeMarketing !== false;
  const defs = SLIP_TEMPLATE_DEFS.filter(
    (d) => includeMarketing || d.category === "UTILITY",
  );
  const results: EnsureOneResult[] = [];
  for (const def of defs) {
    results.push(await ensureSlipTemplate(def));
    // Meta rate-limits template creates
    await new Promise((r) => setTimeout(r, 400));
  }
  return { results, ok: results.every((r) => r.ok) };
}

export async function isSlipTemplateApproved(key: string): Promise<boolean> {
  const def = SLIP_TEMPLATE_DEFS.find((d) => d.key === key);
  if (!def) return false;
  const phoneReady = await isConfiguredPhoneReadyForTemplates();
  if (!phoneReady.ready) return false;
  const name = resolveTemplateName(def);
  const language = slipTemplateLanguage();
  const listed = await listTemplates();
  if (!listed.ok) return false;
  const existing = listed.templates.find(
    (t) => t.name === name && (t.language === language || t.language?.startsWith(language)),
  );
  if (!existing || existing.status !== "APPROVED") return false;
  // DOCUMENT slip keys must have a DOCUMENT header — ignore legacy URL-button templates.
  if (def.kind === "document") {
    const header = (existing.components || []).find(
      (c) => String(c.type).toUpperCase() === "HEADER",
    );
    return String(header?.format || "").toUpperCase() === "DOCUMENT";
  }
  return true;
}

/** Send a DOCUMENT-header slip template (PDF first + body params). */
export async function sendDocumentSlipTemplate(opts: {
  key: string;
  phone: string;
  mediaId: string;
  filename: string;
  bodyParams: string[];
}): Promise<WhatsAppSendResult> {
  const def = SLIP_TEMPLATE_DEFS.find((d) => d.key === opts.key);
  if (!def) return { ok: false, error: `Unknown template key: ${opts.key}` };
  const name = resolveTemplateName(def);
  return sendWhatsAppDocumentTemplate({
    phone: opts.phone,
    templateName: name,
    languageCode: slipTemplateLanguage(),
    mediaId: opts.mediaId,
    filename: opts.filename,
    bodyParams: opts.bodyParams,
  });
}

/** Send a URL-button slip template (body params + public booking id button). */
export async function sendUrlSlipTemplate(opts: {
  key: string;
  phone: string;
  bodyParams: string[];
  publicBookingId: string;
}): Promise<WhatsAppSendResult> {
  const def = SLIP_TEMPLATE_DEFS.find((d) => d.key === opts.key);
  if (!def) return { ok: false, error: `Unknown template key: ${opts.key}` };
  const name = resolveTemplateName(def);
  return sendWhatsAppTemplate(opts.phone, name, slipTemplateLanguage(), [
    {
      type: "body",
      parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: opts.publicBookingId }],
    },
  ]);
}

/** Send a text-only utility/marketing template with ordered body params. */
export async function sendTextSlipTemplate(opts: {
  key: string;
  phone: string;
  bodyParams: string[];
}): Promise<WhatsAppSendResult> {
  const def = SLIP_TEMPLATE_DEFS.find((d) => d.key === opts.key);
  if (!def) return { ok: false, error: `Unknown template key: ${opts.key}` };
  const name = resolveTemplateName(def);
  return sendWhatsAppTemplate(opts.phone, name, slipTemplateLanguage(), [
    {
      type: "body",
      parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
    },
  ]);
}
