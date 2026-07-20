import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, requireUserReadOnly, isResponse, requireJsonContentType } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { logActivity } from "@/lib/activityLog";
import { serializeShopEnquiry, shopEnquiryWriteData } from "@/lib/shopEnquiry";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const enquiries = await prisma.shopEnquiry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return jsonOk(enquiries.map(serializeShopEnquiry));
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    if (!body.customer_name?.trim()) return jsonError("Customer name is required");

    const enquiry = await prisma.shopEnquiry.create({
      data: shopEnquiryWriteData(body),
    });

    logActivity({
      username: user.username,
      action: "created",
      entity: "shop_enquiry",
      entityId: enquiry.id,
      label: `Shop enquiry — ${enquiry.customerName}`,
      after: {
        customerName: enquiry.customerName,
        visitDate: formatDate(enquiry.visitDate, "iso"),
        dressNeededDate: enquiry.dressNeededDate
          ? formatDate(enquiry.dressNeededDate, "iso")
          : null,
      },
    });

    return jsonOk({ ok: true, id: enquiry.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create shop enquiry";
    return jsonError(msg);
  }
}
