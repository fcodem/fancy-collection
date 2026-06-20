import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { getAvailableItemsApi } from "@/lib/booking";
import {
  buildProspectReminderMessage,
  deliverWhatsApp,
  prospectReminderTemplateParams,
} from "@/lib/whatsapp";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!id) return jsonError("Invalid id");

  const lead = await prisma.prospectLead.findUnique({
    where: { id },
    include: { items: { include: { item: true } } },
  });
  if (!lead) return jsonError("Not found", 404);

  const phone = lead.whatsappNo || lead.contact1;
  if (!phone?.trim()) return jsonError("No WhatsApp or contact number on this lead");

  const deliveryIso = formatDate(lead.deliveryDate, "iso");
  const returnIso = formatDate(lead.returnDate, "iso");
  const { free_items } = await getAvailableItemsApi(deliveryIso, returnIso);

  const freeIds = new Set(free_items.map((i) => i.id));
  const selectedIds = lead.items.map((pi) => pi.itemId);
  const unavailable = lead.items.filter((pi) => !freeIds.has(pi.itemId));
  const allAvailable = unavailable.length === 0;

  const dressNames = lead.items.map((pi) =>
    pi.item ? dressDisplayName(pi.item.name, pi.item.category, pi.item.size) : `Item #${pi.itemId}`,
  );
  const unavailableNames = unavailable.map((pi) =>
    pi.item ? dressDisplayName(pi.item.name, pi.item.category, pi.item.size) : `Item #${pi.itemId}`,
  );

  const messageOpts = {
    customerName: lead.customerName,
    deliveryDate: formatDate(lead.deliveryDate, "display"),
    deliveryTime: lead.deliveryTime || undefined,
    returnDate: formatDate(lead.returnDate, "display"),
    returnTime: lead.returnTime || undefined,
    venue: lead.venue || undefined,
    dressNames,
    allAvailable,
    unavailableNames,
  };

  const message = buildProspectReminderMessage(messageOpts);
  const result = await deliverWhatsApp({
    phone,
    userName: lead.customerName,
    message,
    campaignType: "prospect",
    templateParams: prospectReminderTemplateParams(messageOpts),
    source: `prospect-${id}`,
  });

  await prisma.prospectLead.update({
    where: { id },
    data: { lastReminderAt: new Date() },
  });

  if (result.delivered) {
    return jsonOk({
      delivered: true,
      via: result.via,
      messageId: result.messageId,
      availability: {
        all_available: allAvailable,
        available_count: selectedIds.filter((sid) => freeIds.has(sid)).length,
        total_count: selectedIds.length,
        unavailable_items: unavailableNames,
      },
    });
  }

  if (result.error) {
    return jsonError(result.error, 502);
  }

  return jsonOk({
    delivered: false,
    via: result.via,
    whatsappUrl: result.whatsappUrl,
    availability: {
      all_available: allAvailable,
      available_count: selectedIds.filter((sid) => freeIds.has(sid)).length,
      total_count: selectedIds.length,
      unavailable_items: unavailableNames,
    },
  });
}
