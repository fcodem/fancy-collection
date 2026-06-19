import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, requireUserReadOnly, isResponse } from "@/lib/api";
import { parseDate, formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const leads = await prisma.prospectLead.findMany({
    include: { items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
  });

  return jsonOk(
    leads.map((l) => ({
      id: l.id,
      customer_name: l.customerName,
      customer_address: l.customerAddress,
      contact_1: l.contact1,
      whatsapp_no: l.whatsappNo,
      venue: l.venue,
      notes: l.notes,
      staff_names: l.staffNames ? l.staffNames.split(", ") : [],
      delivery_date: formatDate(l.deliveryDate, "iso"),
      delivery_time: l.deliveryTime,
      return_date: formatDate(l.returnDate, "iso"),
      return_time: l.returnTime,
      last_reminder_at: l.lastReminderAt?.toISOString() || null,
      created_at: l.createdAt.toISOString(),
      items: l.items.map((pi) => ({
        id: pi.id,
        item_id: pi.itemId,
        rent: pi.rent,
        dress_name: pi.item
          ? dressDisplayName(pi.item.name, pi.item.category, pi.item.size)
          : `Item #${pi.itemId}`,
      })),
    })),
  );
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    if (!body.customer_name?.trim()) return jsonError("Customer name is required");
    if (!body.delivery_date || !body.return_date) return jsonError("Delivery and return dates are required");
    if (!Array.isArray(body.items) || body.items.length === 0) return jsonError("At least one dress is required");

    const lead = await prisma.prospectLead.create({
      data: {
        customerName: body.customer_name.trim(),
        customerAddress: body.customer_address?.trim() || null,
        contact1: body.contact_1?.trim() || null,
        whatsappNo: body.whatsapp_no?.trim() || null,
        venue: body.venue?.trim() || null,
        notes: body.common_notes?.trim() || null,
        staffNames: Array.isArray(body.staff_names) && body.staff_names.length
          ? body.staff_names.join(", ")
          : null,
        deliveryDate: parseDate(body.delivery_date),
        deliveryTime: body.delivery_time?.trim() || null,
        returnDate: parseDate(body.return_date),
        returnTime: body.return_time?.trim() || null,
        items: {
          create: body.items.map((item: { item_id: number; price?: number }) => ({
            itemId: item.item_id,
            rent: item.price || 0,
          })),
        },
      },
    });

    return jsonOk({ ok: true, id: lead.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create prospect lead";
    return jsonError(msg);
  }
}
