import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  jsonError,
  jsonOk,
  requireUser,
  requireUserReadOnly,
  isResponse,
  requireJsonContentType,
} from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { logActivity } from "@/lib/activityLog";
import { serializeShopEnquiry, shopEnquiryWriteData } from "@/lib/shopEnquiry";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!id) return jsonError("Invalid id");

  const enquiry = await prisma.shopEnquiry.findUnique({ where: { id } });
  if (!enquiry) return jsonError("Not found", 404);

  return jsonOk(serializeShopEnquiry(enquiry));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!id) return jsonError("Invalid id");

  try {
    const existing = await prisma.shopEnquiry.findUnique({ where: { id } });
    if (!existing) return jsonError("Not found", 404);

    const body = await req.json();
    if (!body.customer_name?.trim()) return jsonError("Customer name is required");

    const enquiry = await prisma.shopEnquiry.update({
      where: { id },
      data: shopEnquiryWriteData(body),
    });

    logActivity({
      username: user.username,
      action: "updated",
      entity: "shop_enquiry",
      entityId: enquiry.id,
      label: `Shop enquiry — ${enquiry.customerName}`,
      before: {
        customerName: existing.customerName,
        visitDate: formatDate(existing.visitDate, "iso"),
        dressNeededDate: existing.dressNeededDate
          ? formatDate(existing.dressNeededDate, "iso")
          : null,
      },
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
    const msg = e instanceof Error ? e.message : "Failed to update shop enquiry";
    return jsonError(msg);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!id) return jsonError("Invalid id");

  const existing = await prisma.shopEnquiry.findUnique({ where: { id } });
  if (!existing) return jsonError("Not found", 404);

  await prisma.shopEnquiry.delete({ where: { id } });
  return jsonOk({ ok: true });
}
