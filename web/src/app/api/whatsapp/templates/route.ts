import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

type MetaTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
};

type MetaTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: Array<
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  >;
};

type CreateTemplateBody = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: MetaTemplateComponent[];
};

function metaCredentials() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  if (!token || !wabaid) return null;
  return { token, wabaid, apiVersion };
}

function validateTemplateName(name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(trimmed)) {
    return "Template name must start with a letter and use only lowercase letters, numbers, and underscores.";
  }
  return null;
}

function validateComponents(components: MetaTemplateComponent[]): string | null {
  if (!Array.isArray(components) || components.length === 0) {
    return "At least one component is required.";
  }
  const hasBody = components.some((c) => c.type === "BODY" && c.text?.trim());
  if (!hasBody) return "A BODY component with text is required.";
  for (const c of components) {
    if (c.type === "HEADER" && c.format === "TEXT" && !c.text?.trim()) {
      return "HEADER with TEXT format requires text.";
    }
    if (c.type === "BUTTONS") {
      if (!c.buttons?.length) return "BUTTONS component requires at least one button.";
      if (c.buttons.length > 3) return "Maximum 3 buttons allowed.";
    }
  }
  return null;
}

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const creds = metaCredentials();
  if (!creds) return jsonError("WhatsApp credentials not configured", 500);

  try {
    const res = await fetch(
      `https://graph.facebook.com/${creds.apiVersion}/${creds.wabaid}/message_templates` +
        `?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${creds.token}` } },
    );

    const data = (await res.json()) as {
      data?: MetaTemplate[];
      error?: { message: string };
    };

    if (!res.ok) {
      return jsonError(data.error?.message || "Meta API error", 500);
    }

    return jsonOk({ templates: data.data || [] });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to fetch templates", 500);
  }
}

/** Create a template on Meta (same payload shape as Graph API message_templates). */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  const creds = metaCredentials();
  if (!creds) return jsonError("WhatsApp credentials not configured", 500);

  let body: CreateTemplateBody;
  try {
    body = (await req.json()) as CreateTemplateBody;
  } catch {
    return jsonError("Invalid JSON body");
  }

  const nameErr = validateTemplateName(body.name || "");
  if (nameErr) return jsonError(nameErr);

  const category = body.category;
  if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) {
    return jsonError("category must be MARKETING, UTILITY, or AUTHENTICATION");
  }

  const language = (body.language || "en").trim();
  if (!language) return jsonError("language is required");

  const compErr = validateComponents(body.components);
  if (compErr) return jsonError(compErr);

  const payload = {
    name: body.name.trim().toLowerCase(),
    language,
    category,
    components: body.components.map((c) => {
      if (c.type === "HEADER") {
        return {
          type: "HEADER",
          format: c.format || "TEXT",
          ...(c.format === "TEXT" || !c.format ? { text: c.text?.trim() } : {}),
        };
      }
      if (c.type === "BODY") {
        const body: Record<string, unknown> = { type: "BODY", text: c.text?.trim() };
        if (c.example) body.example = c.example;
        return body;
      }
      if (c.type === "FOOTER") {
        return { type: "FOOTER", text: c.text?.trim() };
      }
      if (c.type === "BUTTONS") {
        return { type: "BUTTONS", buttons: c.buttons };
      }
      return c;
    }),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${creds.apiVersion}/${creds.wabaid}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const data = (await res.json()) as {
      id?: string;
      status?: string;
      category?: string;
      error?: { message: string; error_user_msg?: string };
    };

    if (!res.ok) {
      return jsonError(
        data.error?.error_user_msg || data.error?.message || "Meta API error",
        500,
      );
    }

    return jsonOk({
      ok: true,
      template: {
        id: data.id,
        name: payload.name,
        status: data.status || "PENDING",
        category: data.category || category,
        language,
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to create template", 500);
  }
}

/** Delete a template from Meta by name (Graph API format). */
export async function DELETE(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const creds = metaCredentials();
  if (!creds) return jsonError("WhatsApp credentials not configured", 500);

  const name = req.nextUrl.searchParams.get("name")?.trim().toLowerCase();
  if (!name) return jsonError("Query parameter 'name' is required");

  const nameErr = validateTemplateName(name);
  if (nameErr) return jsonError(nameErr);

  try {
    const url =
      `https://graph.facebook.com/${creds.apiVersion}/${creds.wabaid}/message_templates` +
      `?name=${encodeURIComponent(name)}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${creds.token}` },
    });

    const data = (await res.json()) as {
      success?: boolean;
      error?: { message: string; error_user_msg?: string };
    };

    if (!res.ok) {
      return jsonError(
        data.error?.error_user_msg || data.error?.message || "Meta API error",
        500,
      );
    }

    return jsonOk({ ok: true, deleted: name, success: data.success ?? true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to delete template", 500);
  }
}
