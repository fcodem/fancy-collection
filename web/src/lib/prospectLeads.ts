import "server-only";

import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";
import { logActivity } from "@/lib/activityLog";
import type { ProspectDressWarning } from "@/lib/prospectLeadWarning";

export type { ProspectDressWarning };
export { formatProspectConfirmMessage } from "@/lib/prospectLeadWarning";

/** Find prospect leads that currently include any of these inventory items. */
export async function findProspectWarningsByItemIds(
  itemIds: number[],
): Promise<Map<number, ProspectDressWarning[]>> {
  const ids = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, ProspectDressWarning[]>();
  if (!ids.length) return out;

  const rows = await prisma.prospectLeadItem.findMany({
    where: { itemId: { in: ids } },
    select: {
      id: true,
      itemId: true,
      rent: true,
      item: { select: { name: true, category: true, size: true } },
      prospectLead: {
        select: {
          id: true,
          customerName: true,
          customerAddress: true,
          contact1: true,
          whatsappNo: true,
          venue: true,
          notes: true,
          staffNames: true,
          deliveryDate: true,
          deliveryTime: true,
          returnDate: true,
          returnTime: true,
          createdAt: true,
          items: {
            select: {
              itemId: true,
              item: { select: { name: true, category: true, size: true } },
            },
          },
        },
      },
    },
  });

  for (const row of rows) {
    const lead = row.prospectLead;
    const dressName = dressDisplayName(
      row.item.name,
      row.item.category,
      row.item.size,
    );
    const otherDresses = lead.items
      .filter((i) => i.itemId !== row.itemId)
      .map((i) => dressDisplayName(i.item.name, i.item.category, i.item.size));

    const warning: ProspectDressWarning = {
      prospect_lead_id: lead.id,
      prospect_lead_item_id: row.id,
      customer_name: lead.customerName,
      customer_address: lead.customerAddress || "",
      contact_1: lead.contact1 || "",
      whatsapp_no: lead.whatsappNo || "",
      venue: lead.venue || "",
      notes: lead.notes || "",
      staff_names: lead.staffNames || "",
      delivery_date: formatDate(lead.deliveryDate, "display"),
      delivery_time: lead.deliveryTime || "",
      return_date: formatDate(lead.returnDate, "display"),
      return_time: lead.returnTime || "",
      created_at: formatDate(lead.createdAt, "display"),
      rent: row.rent || 0,
      dress_name: dressName,
      other_dresses: otherDresses,
    };

    const list = out.get(row.itemId) || [];
    list.push(warning);
    out.set(row.itemId, list);
  }

  return out;
}

/**
 * After a dress is booked, remove matching prospect dress lines.
 * If a prospect has no dresses left, delete the whole prospect record.
 */
export async function consumeProspectItemsForBookedDresses(
  itemIds: number[],
  opts?: { bookingId?: number; by?: string },
): Promise<{ removedItems: number; deletedLeads: number }> {
  const ids = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return { removedItems: 0, deletedLeads: 0 };

  const matched = await prisma.prospectLeadItem.findMany({
    where: { itemId: { in: ids } },
    select: { id: true, prospectLeadId: true, itemId: true },
  });
  if (!matched.length) return { removedItems: 0, deletedLeads: 0 };

  const lineIds = matched.map((m) => m.id);
  const leadIds = [...new Set(matched.map((m) => m.prospectLeadId))];

  await prisma.prospectLeadItem.deleteMany({ where: { id: { in: lineIds } } });

  let deletedLeads = 0;
  for (const leadId of leadIds) {
    const remaining = await prisma.prospectLeadItem.count({
      where: { prospectLeadId: leadId },
    });
    if (remaining === 0) {
      await prisma.prospectLead.delete({ where: { id: leadId } }).catch(() => null);
      deletedLeads += 1;
    }
  }

  logActivity({
    username: opts?.by || "system",
    action: "updated",
    entity: "prospect_lead",
    entityId: opts?.bookingId || leadIds[0] || 0,
    label: `Cleared ${lineIds.length} prospect dress line(s)${
      deletedLeads ? `, deleted ${deletedLeads} empty prospect(s)` : ""
    } after booking${opts?.bookingId ? ` #${opts.bookingId}` : ""}`,
  });

  return { removedItems: lineIds.length, deletedLeads };
}
