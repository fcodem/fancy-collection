import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, jsonOk, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rows = await prisma.staffLoginRequest.findMany({
    where: { status: "pending" },
    include: { user: { include: { staff: true } } },
    orderBy: { requestedAt: "asc" },
  });
  return jsonOk(rows.map((r) => ({
    id: r.id,
    username: r.user.username,
    staff_name: r.user.staff?.name || r.user.username,
    requested_at: r.requestedAt.toISOString(),
  })));
}
