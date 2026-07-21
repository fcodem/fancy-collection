import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import {
  clearWhatsAppBotSettingsCache,
  getWhatsAppBotSettingsDefaults,
  loadWhatsAppBotSettings,
} from "@/lib/services/whatsapp/botSettings";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const settings = await loadWhatsAppBotSettings();
  const defaults = getWhatsAppBotSettingsDefaults();

  let dbRow = null;
  try {
    dbRow = await prisma.whatsAppBotConfig.findUnique({ where: { id: 1 } });
  } catch {
    dbRow = null;
  }

  return jsonOk({
    settings,
    defaults,
    dbConfigured: Boolean(dbRow),
  });
}

export async function PUT(req: NextRequest) {
  const ct = requireJsonContentType(req);
  if (ct) return ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json()) as {
    shopName?: string;
    address?: string;
    hours?: string;
    phone?: string;
    greetingReply?: string;
    priceReply?: string;
    rentalProcessReply?: string;
    securityAdvanceReply?: string;
    handoverReply?: string;
    bookingCompleteReply?: string;
    automatedDisclaimer?: string;
    botEnabled?: boolean;
    flowEnabled?: boolean;
  };

  const data = {
    shopName: body.shopName?.trim() || null,
    address: body.address?.trim() || null,
    hours: body.hours?.trim() || null,
    phone: body.phone?.trim() || null,
    greetingReply: body.greetingReply?.trim() || null,
    priceReply: body.priceReply?.trim() || null,
    rentalProcessReply: body.rentalProcessReply?.trim() || null,
    securityAdvanceReply: body.securityAdvanceReply?.trim() || null,
    handoverReply: body.handoverReply?.trim() || null,
    bookingCompleteReply: body.bookingCompleteReply?.trim() || null,
    automatedDisclaimer: body.automatedDisclaimer?.trim() || null,
    botEnabled: body.botEnabled ?? true,
    flowEnabled: body.flowEnabled ?? true,
  };

  const saved = await prisma.whatsAppBotConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  clearWhatsAppBotSettingsCache();

  return jsonOk({ ok: true, config: saved, settings: await loadWhatsAppBotSettings() });
}
