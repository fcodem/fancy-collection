import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, jsonOk, jsonError, isResponse } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const reqRow = await prisma.staffLoginRequest.findUnique({ where: { id: parseInt(id, 10) } });
  if (!reqRow || reqRow.status !== "pending") return jsonError("Request not found or already resolved.");
  await prisma.staffLoginRequest.update({
    where: { id: reqRow.id },
    data: { status: "rejected", resolvedAt: new Date(), resolvedById: user.id },
  });
  return jsonOk({ ok: true });
}
