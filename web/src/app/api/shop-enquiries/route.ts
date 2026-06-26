import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, requireUserReadOnly, isResponse } from "@/lib/api";
import { parseDate, formatDate } from "@/lib/constants";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const enquiries = await prisma.shopEnquiry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return jsonOk(
    enquiries.map((e) => ({
      id: e.id,
      customer_name: e.customerName,
      customer_address: e.customerAddress,
      contact_1: e.contact1,
      whatsapp_no: e.whatsappNo,
      enquiry_notes: e.enquiryNotes,
      staff_names: e.staffNames ? e.staffNames.split(", ") : [],
      visit_date: formatDate(e.visitDate, "iso"),
      created_at: e.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    if (!body.customer_name?.trim()) return jsonError("Customer name is required");

    const enquiry = await prisma.shopEnquiry.create({
      data: {
        customerName: body.customer_name.trim(),
        customerAddress: body.customer_address?.trim() || null,
        contact1: body.contact_1?.trim() || null,
        whatsappNo: body.whatsapp_no?.trim() || null,
        enquiryNotes: body.enquiry_notes?.trim() || null,
        staffNames: Array.isArray(body.staff_names) && body.staff_names.length
          ? body.staff_names.join(", ")
          : null,
        visitDate: body.visit_date ? new Date(body.visit_date + "T00:00:00.000Z") : new Date(),
      },
    });

    logActivity({
      username: user.username,
      action: "created",
      entity: "shop_enquiry",
      entityId: enquiry.id,
      label: `Shop enquiry — ${enquiry.customerName}`,
      after: {
        customerName: enquiry.customerName,
        visitDate: body.visit_date || formatDate(new Date(), "iso"),
      },
    });

    return jsonOk({ ok: true, id: enquiry.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create shop enquiry";
    return jsonError(msg);
  }
}
