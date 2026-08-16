import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import prisma from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone";
import {
  graphApiVersion,
  sendWhatsAppImageHeaderTemplate,
  sendWhatsAppTemplate,
  uploadWhatsAppMedia,
} from "@/lib/services/whatsapp/metaApi";
import { SALE_1_FLYER_RELATIVE_PATH } from "@/lib/services/whatsapp/sale1TemplateCopy";

type Recipient = { phone: string; name: string };

type MetaTemplateLite = {
  name: string;
  status: string;
  language: string;
  components?: Array<{ type?: string; format?: string; text?: string }>;
};

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return jsonOk({ broadcasts });
}

function templateHasBodyVar(components?: MetaTemplateLite["components"]): boolean {
  const body = (components || []).find((c) => String(c.type).toUpperCase() === "BODY");
  return /\{\{\s*1\s*\}\}/.test(body?.text || "");
}

function templateHeaderFormat(
  components?: MetaTemplateLite["components"],
): "IMAGE" | "VIDEO" | "DOCUMENT" | "TEXT" | "NONE" {
  const header = (components || []).find((c) => String(c.type).toUpperCase() === "HEADER");
  const format = String(header?.format || "").toUpperCase();
  if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT" || format === "TEXT") {
    return format;
  }
  return header ? "TEXT" : "NONE";
}

async function fetchMetaTemplate(
  name: string,
  language: string,
): Promise<MetaTemplateLite | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaid = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !wabaid) return null;

  let url: string | null =
    `https://graph.facebook.com/${graphApiVersion()}/${wabaid}/message_templates` +
    `?fields=name,status,language,components&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as {
      data?: MetaTemplateLite[];
      paging?: { next?: string };
    };
    if (!res.ok) return null;
    const hit = (data.data || []).find(
      (t) =>
        t.name === name &&
        (t.language === language || t.language?.startsWith(language) || language.startsWith(t.language)),
    );
    if (hit) return hit;
    url = data.paging?.next || null;
  }
  return null;
}

function resolveBroadcastFlyerPath(templateName: string): string | null {
  const n = templateName.trim().toLowerCase();
  if (n === "sale_1" || n === "sale1") {
    return path.join(process.cwd(), SALE_1_FLYER_RELATIVE_PATH);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json()) as {
    templateName: string;
    templateLanguage?: string;
    recipientType: "all_customers" | "pending_returns" | "custom_phones" | "excel_sheet";
    customPhones?: string[];
    excelRecipients?: Array<{ phone?: string; name?: string }>;
    /** When true, send customer name as template body {{1}}. */
    injectNameAsBodyVar?: boolean;
    components?: unknown[];
    broadcastName: string;
  };

  const {
    templateName,
    templateLanguage = "en",
    recipientType,
    customPhones,
    excelRecipients,
    injectNameAsBodyVar = false,
    broadcastName,
  } = body;

  if (!templateName || !broadcastName) {
    return jsonError("templateName and broadcastName are required", 400);
  }

  let phones: Recipient[] = [];

  if (recipientType === "excel_sheet") {
    if (!excelRecipients?.length) {
      return jsonError("Excel sheet has no valid recipients (need Name + Phone columns).", 400);
    }
    const seen = new Set<string>();
    for (const row of excelRecipients) {
      const normalized = normalizeIndianPhone(String(row.phone || ""));
      if (!normalized) continue;
      const key = normalized.replace(/\D/g, "").slice(-10);
      if (seen.has(key)) continue;
      seen.add(key);
      phones.push({
        phone: normalized,
        name: (row.name || "Customer").trim() || "Customer",
      });
    }
  } else if (recipientType === "custom_phones" && customPhones) {
    phones = customPhones
      .map((p) => {
        const phone = normalizeIndianPhone(p) || p.trim();
        return phone ? { phone, name: "Customer" } : null;
      })
      .filter((p): p is Recipient => Boolean(p));
  } else if (recipientType === "all_customers") {
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ whatsappNo: { not: null } }, { NOT: { contact1: "" } }],
        status: { not: "cancelled" },
      },
      select: { customerName: true, whatsappNo: true, contact1: true },
      distinct: ["whatsappNo"],
    });
    phones = bookings
      .map((b) => ({ phone: b.whatsappNo || b.contact1 || "", name: b.customerName }))
      .filter((p) => p.phone);
  } else if (recipientType === "pending_returns") {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const bookings = await prisma.booking.findMany({
      where: {
        returnDate: { gte: today, lte: nextWeek },
        status: "active",
      },
      select: { customerName: true, whatsappNo: true, contact1: true },
    });
    phones = bookings
      .map((b) => ({ phone: b.whatsappNo || b.contact1 || "", name: b.customerName }))
      .filter((p) => p.phone);
  }

  if (phones.length === 0) {
    return jsonError("No recipients found", 400);
  }

  const metaTpl = await fetchMetaTemplate(templateName, templateLanguage);
  if (!metaTpl) {
    return jsonError(
      `Template "${templateName}" not found on Meta for language ${templateLanguage}. Refresh Templates and try again.`,
      400,
    );
  }
  if (String(metaTpl.status).toUpperCase() !== "APPROVED") {
    return jsonError(
      `Template "${templateName}" is ${metaTpl.status} on Meta — wait for APPROVED before broadcasting.`,
      400,
    );
  }

  const headerFormat = templateHeaderFormat(metaTpl.components);
  const needsBodyName =
    injectNameAsBodyVar ||
    recipientType === "excel_sheet" ||
    templateHasBodyVar(metaTpl.components);

  if (needsBodyName && !templateHasBodyVar(metaTpl.components)) {
    // Template has no {{1}} — do not send body params (Meta rejects extras).
  }
  const sendBodyName = needsBodyName && templateHasBodyVar(metaTpl.components);

  let imageMediaId: string | null = null;
  if (headerFormat === "IMAGE") {
    const flyerPath = resolveBroadcastFlyerPath(templateName);
    if (!flyerPath || !existsSync(flyerPath)) {
      return jsonError(
        `Template "${templateName}" needs an IMAGE header, but the flyer file was not found on the server.`,
        500,
      );
    }
    const uploaded = await uploadWhatsAppMedia(
      readFileSync(flyerPath),
      path.basename(flyerPath),
      "image/png",
    );
    if (!uploaded.ok) {
      return jsonError(`Could not upload flyer image for broadcast: ${uploaded.error}`, 500);
    }
    imageMediaId = uploaded.mediaId;
  } else if (headerFormat === "VIDEO" || headerFormat === "DOCUMENT") {
    return jsonError(
      `Broadcast does not yet support ${headerFormat} header templates. Use a text or image marketing template.`,
      400,
    );
  }

  const broadcast = await prisma.whatsAppBroadcast.create({
    data: {
      name: broadcastName,
      templateName,
      status: "sending",
      totalCount: phones.length,
      sentCount: 0,
      failedCount: 0,
      createdBy: user.username,
    },
  });

  void sendBroadcastMessages({
    broadcastId: broadcast.id,
    phones,
    templateName,
    language: metaTpl.language || templateLanguage,
    imageMediaId,
    sendBodyName,
  });

  return jsonOk({
    ok: true,
    broadcastId: broadcast.id,
    totalRecipients: phones.length,
    message: "Broadcast started. Check status for progress.",
    headerFormat,
  });
}

async function sendBroadcastMessages(opts: {
  broadcastId: number;
  phones: Recipient[];
  templateName: string;
  language: string;
  imageMediaId: string | null;
  sendBodyName: boolean;
}) {
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const recipient of opts.phones) {
    try {
      const bodyParams = opts.sendBodyName
        ? [(recipient.name || "Customer").slice(0, 1024)]
        : [];
      const result = opts.imageMediaId
        ? await sendWhatsAppImageHeaderTemplate({
            phone: recipient.phone,
            templateName: opts.templateName,
            languageCode: opts.language,
            mediaId: opts.imageMediaId,
            bodyParams,
          })
        : await sendWhatsAppTemplate(
            recipient.phone,
            opts.templateName,
            opts.language,
            bodyParams.length
              ? [
                  {
                    type: "body",
                    parameters: bodyParams.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          );
      if (result.ok) {
        sent++;
      } else {
        failed++;
        lastError = result.error || "Send failed";
        console.error(
          `[broadcast ${opts.broadcastId}] fail ${recipient.phone}: ${lastError}`,
        );
      }
    } catch (e) {
      failed++;
      lastError = e instanceof Error ? e.message : "Send failed";
      console.error(`[broadcast ${opts.broadcastId}] exception ${recipient.phone}:`, e);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  await prisma.whatsAppBroadcast.update({
    where: { id: opts.broadcastId },
    data: {
      status: "completed",
      sentCount: sent,
      failedCount: failed,
      lastError: lastError ? lastError.slice(0, 2000) : null,
      completedAt: new Date(),
    },
  });

  console.log(`[broadcast ${opts.broadcastId}] Done: ${sent} sent, ${failed} failed`, lastError || "");
}
