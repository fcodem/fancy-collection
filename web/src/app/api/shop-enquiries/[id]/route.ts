import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

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
