import { NextRequest, after } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import prisma from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone";
import { graphApiVersion } from "@/lib/services/whatsapp/metaApi";
import {
  drainBroadcastQueue,
  failOrphanBroadcasts,
  processBroadcastBatch,
  type BroadcastRecipient,
} from "@/lib/services/whatsapp/broadcastSend";
import { loadSale1FlyerBuffer } from "@/lib/services/whatsapp/sale1TemplateCopy";

export const maxDuration = 300;

type MetaTemplateLite = {
  name: string;
  status: string;
  language: string;
  components?: Array<{ type?: string; format?: string; text?: string }>;
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

  let phones: BroadcastRecipient[] = [];

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
      .filter((p): p is BroadcastRecipient => Boolean(p));
  } else if (recipientType === "all_customers") {
    const [customers, bookings] = await Promise.all([
      prisma.customer.findMany({
        select: { name: true, phone: true },
        take: 20000,
      }),
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
      if (key.length < 10) return;
      if (byPhone.has(key)) return;
      byPhone.set(key, {
        phone,
        name: (rawName || "Customer").trim() || "Customer",
      });
    };

    for (const c of customers) addRecipient(c.phone || "", c.name || "Customer");
    for (const b of bookings) {
      addRecipient(b.whatsappNo || b.contact1 || "", b.customerName || "Customer");
    }
    phones = [...byPhone.values()];
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
  const sendBodyName = needsBodyName && templateHasBodyVar(metaTpl.components);

  if (headerFormat === "IMAGE") {
    const flyer = await loadSale1FlyerBuffer();
    if (!flyer?.length) {
      return jsonError(
        `Template "${templateName}" needs an IMAGE header, but the flyer file was not found on the server.`,
        500,
      );
    }
  } else if (headerFormat === "VIDEO" || headerFormat === "DOCUMENT") {
    return jsonError(
      `Broadcast does not yet support ${headerFormat} header templates. Use a text or image marketing template.`,
      400,
    );
  }

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
      recipientsJson: phones,
      createdBy: user.username,
    },
  });

  const kick = async () => {
    try {
      // First chunk immediately so history moves off "0 sent".
      await processBroadcastBatch({ broadcastId: broadcast.id, limit: 25 });
      // Keep draining while this invocation is alive.
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
  });
}
