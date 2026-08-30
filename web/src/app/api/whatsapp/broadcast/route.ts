import { NextRequest, after } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import prisma from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone";
import { saveUpload } from "@/lib/upload";
import { graphApiVersion } from "@/lib/services/whatsapp/metaApi";
import {
  drainBroadcastQueue,
  failOrphanBroadcasts,
  processBroadcastBatch,
  type BroadcastRecipient,
} from "@/lib/services/whatsapp/broadcastSend";
import { isSale1FlyerTemplate, loadSale1FlyerBuffer } from "@/lib/services/whatsapp/sale1TemplateCopy";
import { buildBroadcastRecipientsPayload } from "@/lib/services/whatsapp/broadcastPayload";
import {
  countBodyTemplateVars,
  templateBodyText,
  templateHeaderFormat,
} from "@/lib/whatsappTemplateVars";

export const maxDuration = 300;

type MetaTemplateLite = {
  name: string;
  status: string;
  language: string;
  components?: Array<{ type?: string; format?: string; text?: string }>;
};

type BroadcastRequestBody = {
  templateName: string;
  templateLanguage?: string;
  recipientType: "all_customers" | "pending_returns" | "custom_phones" | "excel_sheet";
  customPhones?: string[];
  excelRecipients?: Array<{ phone?: string; name?: string }>;
  injectNameAsBodyVar?: boolean;
  broadcastName: string;
  bodyVariables?: string[];
  headerImagePath?: string;
};

export async function GET(_req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  await failOrphanBroadcasts().catch(() => 0);

  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const active = broadcasts.find((b) => b.status === "sending");
  if (active) {
    try {
      after(() => {
        void processBroadcastBatch({ broadcastId: active.id, limit: 35 });
      });
    } catch {
      void processBroadcastBatch({ broadcastId: active.id, limit: 20 }).catch(() => undefined);
    }
  }

  return jsonOk({ broadcasts });
}

function templateHasBodyVar(components?: MetaTemplateLite["components"]): boolean {
  return countBodyTemplateVars(templateBodyText(components)) > 0;
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

async function resolveRecipients(
  recipientType: BroadcastRequestBody["recipientType"],
  customPhones?: string[],
  excelRecipients?: Array<{ phone?: string; name?: string }>,
): Promise<BroadcastRecipient[]> {
  if (recipientType === "excel_sheet") {
    if (!excelRecipients?.length) return [];
    const seen = new Set<string>();
    const phones: BroadcastRecipient[] = [];
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
    return phones;
  }

  if (recipientType === "custom_phones" && customPhones) {
    return customPhones
      .map((p) => {
        const phone = normalizeIndianPhone(p) || p.trim();
        return phone ? { phone, name: "Customer" } : null;
      })
      .filter((p): p is BroadcastRecipient => Boolean(p));
  }

  if (recipientType === "all_customers") {
    const [customers, bookings] = await Promise.all([
      prisma.customer.findMany({ select: { name: true, phone: true }, take: 20000 }),
      prisma.booking.findMany({
        where: {
          OR: [{ whatsappNo: { not: null } }, { NOT: { contact1: "" } }],
          status: { not: "cancelled" },
        },
        select: { customerName: true, whatsappNo: true, contact1: true },
        take: 20000,
      }),
    ]);

    const byPhone = new Map<string, BroadcastRecipient>();
    const addRecipient = (rawPhone: string, rawName: string) => {
      const phone = normalizeIndianPhone(rawPhone) || rawPhone.trim();
      if (!phone) return;
      const key = phone.replace(/\D/g, "").slice(-10);
      if (key.length < 10 || byPhone.has(key)) return;
      byPhone.set(key, { phone, name: (rawName || "Customer").trim() || "Customer" });
    };
    for (const c of customers) addRecipient(c.phone || "", c.name || "Customer");
    for (const b of bookings) {
      addRecipient(b.whatsappNo || b.contact1 || "", b.customerName || "Customer");
    }
    return [...byPhone.values()];
  }

  if (recipientType === "pending_returns") {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const bookings = await prisma.booking.findMany({
      where: { returnDate: { gte: today, lte: nextWeek }, status: "active" },
      select: { customerName: true, whatsappNo: true, contact1: true },
    });
    return bookings
      .map((b) => ({ phone: b.whatsappNo || b.contact1 || "", name: b.customerName }))
      .filter((p) => p.phone);
  }

  return [];
}

async function parseBroadcastRequest(req: NextRequest): Promise<{
  body: BroadcastRequestBody;
  headerImageFile: File | null;
}> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    let bodyVariables: string[] = [];
    const rawVars = form.get("bodyVariables");
    if (rawVars) {
      try {
        const parsed = JSON.parse(String(rawVars));
        if (Array.isArray(parsed)) bodyVariables = parsed.map((v) => String(v ?? ""));
      } catch {
        /* ignore */
      }
    }
    const rawExcel = form.get("excelRecipients");
    let excelRecipients: Array<{ phone?: string; name?: string }> | undefined;
    if (rawExcel) {
      try {
        excelRecipients = JSON.parse(String(rawExcel)) as Array<{ phone?: string; name?: string }>;
      } catch {
        excelRecipients = undefined;
      }
    }
    const headerImage = form.get("headerImage");
    return {
      body: {
        templateName: String(form.get("templateName") || ""),
        templateLanguage: String(form.get("templateLanguage") || "en"),
        recipientType: String(form.get("recipientType") || "all_customers") as BroadcastRequestBody["recipientType"],
        broadcastName: String(form.get("broadcastName") || ""),
        injectNameAsBodyVar: String(form.get("injectNameAsBodyVar") || "") === "true",
        customPhones: String(form.get("customPhones") || "")
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
        bodyVariables,
        excelRecipients,
      },
      headerImageFile: headerImage instanceof File && headerImage.size > 0 ? headerImage : null,
    };
  }

  const body = (await req.json()) as BroadcastRequestBody & {
    excelRecipients?: Array<{ phone?: string; name?: string }>;
  };
  return { body, headerImageFile: null };
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { body, headerImageFile } = await parseBroadcastRequest(req);
  const {
    templateName,
    templateLanguage = "en",
    recipientType,
    customPhones,
    excelRecipients,
    injectNameAsBodyVar = false,
    broadcastName,
    bodyVariables = [],
    headerImagePath: presetHeaderPath,
  } = body;

  if (!templateName || !broadcastName) {
    return jsonError("templateName and broadcastName are required", 400);
  }

  const phones = await resolveRecipients(
    recipientType,
    customPhones,
    excelRecipients ?? (body as { excelRecipients?: Array<{ phone?: string; name?: string }> }).excelRecipients,
  );

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
  const bodyVarCount = countBodyTemplateVars(templateBodyText(metaTpl.components));
  const needsBodyName =
    injectNameAsBodyVar || recipientType === "excel_sheet" || bodyVarCount > 0;
  const sendBodyName = needsBodyName && /\{\{\s*1\s*\}\}/.test(templateBodyText(metaTpl.components));

  let headerImagePath = presetHeaderPath || null;
  if (headerImageFile) {
    headerImagePath = await saveUpload(headerImageFile);
  }

  if (headerFormat === "IMAGE") {
    if (!headerImagePath && !isSale1FlyerTemplate(templateName)) {
      return jsonError(
        `Template "${templateName}" needs a poster image. Upload one under Broadcast before sending.`,
        400,
      );
    }
    if (!headerImagePath && isSale1FlyerTemplate(templateName)) {
      const flyer = await loadSale1FlyerBuffer();
      if (!flyer?.length) {
        return jsonError(
          `Template "${templateName}" needs an IMAGE header, but the default flyer was not found. Upload a poster image instead.`,
          500,
        );
      }
    }
  } else if (headerFormat === "VIDEO" || headerFormat === "DOCUMENT") {
    return jsonError(
      `Broadcast does not yet support ${headerFormat} header templates. Use a text or image marketing template.`,
      400,
    );
  }

  const paddedVars = Array.from({ length: bodyVarCount }, (_, i) => bodyVariables[i] ?? "");

  const language = metaTpl.language || templateLanguage;

  const broadcast = await prisma.whatsAppBroadcast.create({
    data: {
      name: broadcastName,
      templateName,
      status: "sending",
      totalCount: phones.length,
      sentCount: 0,
      failedCount: 0,
      nextIndex: 0,
      language,
      sendBodyName,
      headerFormat,
      recipientsJson: buildBroadcastRecipientsPayload(phones, {
        bodyVariables: paddedVars,
        useNameForVar1: sendBodyName,
        headerImagePath,
      }),
      createdBy: user.username,
    },
  });

  const kick = async () => {
    try {
      await processBroadcastBatch({ broadcastId: broadcast.id, limit: 25 });
      await drainBroadcastQueue({ runtimeBudgetMs: 240_000, batchSize: 40 });
    } catch (e) {
      console.error(`[broadcast ${broadcast.id}] kick failed:`, e);
    }
  };

  try {
    after(() => {
      void kick();
    });
  } catch {
    void kick();
  }

  return jsonOk({
    ok: true,
    broadcastId: broadcast.id,
    totalRecipients: phones.length,
    message: `Broadcast queued to ${phones.length} recipients. Progress updates automatically — keep Refreshing history.`,
    headerFormat,
    bodyVarCount,
  });
}
