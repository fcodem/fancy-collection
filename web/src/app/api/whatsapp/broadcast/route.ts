import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import prisma from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone";
import { sendWhatsAppTemplate } from "@/lib/services/whatsapp/metaApi";

type Recipient = { phone: string; name: string };

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return jsonOk({ broadcasts });
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
    components = [],
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

  void sendBroadcastMessages(
    broadcast.id,
    phones,
    templateName,
    templateLanguage,
    components,
    injectNameAsBodyVar || recipientType === "excel_sheet",
  );

  return jsonOk({
    ok: true,
    broadcastId: broadcast.id,
    totalRecipients: phones.length,
    message: "Broadcast started. Check status for progress.",
  });
}

function bodyComponentsForName(name: string): unknown[] {
  return [
    {
      type: "body",
      parameters: [{ type: "text", text: (name || "Customer").slice(0, 1024) }],
    },
  ];
}

async function sendBroadcastMessages(
  broadcastId: number,
  phones: Recipient[],
  templateName: string,
  language: string,
  components: unknown[],
  injectNameAsBodyVar: boolean,
) {
  let sent = 0;
  let failed = 0;

  for (const recipient of phones) {
    try {
      const comps =
        components.length > 0
          ? components
          : injectNameAsBodyVar
            ? bodyComponentsForName(recipient.name)
            : [];
      const result = await sendWhatsAppTemplate(recipient.phone, templateName, language, comps);
      if (result.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  await prisma.whatsAppBroadcast.update({
    where: { id: broadcastId },
    data: {
      status: "completed",
      sentCount: sent,
      failedCount: failed,
      completedAt: new Date(),
    },
  });

  console.log(`[broadcast ${broadcastId}] Done: ${sent} sent, ${failed} failed`);
}
