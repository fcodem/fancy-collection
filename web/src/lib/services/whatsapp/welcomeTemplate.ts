import "server-only";

import { graphApiVersion, sendWhatsAppTemplate, type WhatsAppSendResult } from "./metaApi";
import {
  bookingBillTemplateLanguage,
  isConfiguredPhoneReadyForTemplates,
} from "./bookingBillTemplate";
import { loadWhatsAppBotSettings } from "./botSettings";
import {
  buildCustomerWelcomeTemplateComponents,
  customerWelcomeTemplateLanguage,
  customerWelcomeTemplateName,
  customerWelcomeTemplatePreviewBody,
  getCustomerWelcomeTemplateDefaults,
} from "./welcomeTemplateCopy";

export {
  CUSTOMER_WELCOME_TEMPLATE_NAME_DEFAULT,
  buildCustomerWelcomeTemplateComponents,
  customerWelcomeTemplateLanguage,
  customerWelcomeTemplateName,
  customerWelcomeTemplatePreviewBody,
  getCustomerWelcomeTemplateDefaults,
} from "./welcomeTemplateCopy";

type MetaTemplateListItem = {
  name: string;
  status: string;
  language: string;
  components?: Array<{ type: string; buttons?: Array<{ type: string; text?: string }> }>;
};

async function listMessageTemplates(): Promise<
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
    return { ok: false, error: data.error?.message || `List templates HTTP ${res.status}` };
  }
  return { ok: true, templates: data.data || [] };
}

async function createMetaTemplate(payload: Record<string, unknown>): Promise<
  | { ok: true; id?: string; status?: string }
  | { ok: false; error: string }
> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

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
      error: data.error?.error_user_msg || data.error?.message || `Create template HTTP ${res.status}`,
    };
  }
  return { ok: true, id: data.id, status: data.status || "PENDING" };
}

function templateHasTwoUrlButtons(template: MetaTemplateListItem): boolean {
  const buttons = (template.components || []).find((c) => c.type === "BUTTONS")?.buttons || [];
  const urlButtons = buttons.filter((b) => String(b.type).toUpperCase() === "URL");
  return urlButtons.length >= 2;
}

export type CustomerWelcomeTemplateStatus = {
  ok: boolean;
  name: string;
  language: string;
  status: string | null;
  ready: boolean;
  error?: string;
  message?: string;
};

export async function getCustomerWelcomeTemplateStatus(): Promise<CustomerWelcomeTemplateStatus> {
  const name = customerWelcomeTemplateName();
  const language = customerWelcomeTemplateLanguage() || bookingBillTemplateLanguage();
  const phoneReady = await isConfiguredPhoneReadyForTemplates();
  if (!phoneReady.ready) {
    return {
      ok: false,
      name,
      language,
      status: null,
      ready: false,
      error: phoneReady.error,
    };
  }

  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return { ok: false, name, language, status: null, ready: false, error: listed.error };
  }

  const existing = listed.templates.find(
    (t) =>
      t.name === name &&
      (t.language === language || t.language?.startsWith(language.split("_")[0] || language)),
  );

  if (!existing) {
    return {
      ok: true,
      name,
      language,
      status: null,
      ready: false,
      message: "Template not submitted yet. POST /api/whatsapp/templates/welcome to create it on Meta.",
    };
  }

  const ready = existing.status === "APPROVED" && templateHasTwoUrlButtons(existing);
  return {
    ok: true,
    name,
    language: existing.language || language,
    status: existing.status,
    ready,
    error:
      existing.status === "APPROVED" && !templateHasTwoUrlButtons(existing)
        ? `Template "${name}" is approved but missing two URL buttons. Create customer_welcome_v2.`
        : existing.status === "REJECTED"
          ? `Template "${name}" was rejected by Meta. Review in Business Manager and submit a new version.`
          : undefined,
    message:
      existing.status === "PENDING"
        ? "Waiting for Meta approval (usually 24–48 hours)."
        : ready
          ? "Ready — auto-welcome will use this template with Maps + Instagram buttons."
          : undefined,
  };
}

export type EnsureCustomerWelcomeTemplateResult = {
  ok: boolean;
  name: string;
  language: string;
  status?: string;
  id?: string;
  created?: boolean;
  error?: string;
  message?: string;
};

/** Submit customer welcome template to Meta (Maps + Instagram URL buttons). */
export async function ensureCustomerWelcomeTemplate(): Promise<EnsureCustomerWelcomeTemplateResult> {
  const settings = await loadWhatsAppBotSettings();
  const name = customerWelcomeTemplateName();
  const language = customerWelcomeTemplateLanguage() || bookingBillTemplateLanguage();

  const listed = await listMessageTemplates();
  if (!listed.ok) {
    return { ok: false, name, language, error: listed.error };
  }

  const existing = listed.templates.find(
    (t) =>
      t.name === name &&
      (t.language === language || t.language?.startsWith(language.split("_")[0] || language)),
  );

  if (existing) {
    return {
      ok: true,
      name,
      language: existing.language || language,
      status: existing.status,
      created: false,
      message:
        existing.status === "APPROVED"
          ? "Template already approved on Meta"
          : existing.status === "PENDING"
            ? "Template already submitted — waiting for Meta approval"
            : `Template exists with status: ${existing.status}`,
    };
  }

  const created = await createMetaTemplate({
    name,
    language,
    category: "UTILITY",
    allow_category_change: true,
    components: buildCustomerWelcomeTemplateComponents(settings),
  });

  if (!created.ok) {
    return { ok: false, name, language, error: created.error };
  }

  return {
    ok: true,
    name,
    language,
    status: created.status,
    id: created.id,
    created: true,
    message: "Customer welcome template submitted to Meta for approval",
  };
}

/** Send approved welcome template (static body + two URL buttons). */
export async function sendCustomerWelcomeTemplate(phone: string): Promise<WhatsAppSendResult> {
  const status = await getCustomerWelcomeTemplateStatus();
  if (!status.ready) {
    return {
      ok: false,
      error:
        status.error ||
        status.message ||
        `Welcome template "${status.name}" is not APPROVED yet (status: ${status.status ?? "missing"}).`,
    };
  }

  const language = status.language || customerWelcomeTemplateLanguage();
  const name = status.name;

  const sendOnce = (lang: string) => sendWhatsAppTemplate(phone, name, lang, []);

  let result = await sendOnce(language);
  if (
    !result.ok &&
    /132001|translation|language/i.test(result.error || "") &&
    language !== "en_US"
  ) {
    const alt = await sendOnce("en_US");
    if (alt.ok) return alt;
  }
  return result;
}
