import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (!jobId) return jsonError("Invalid job id");

  const existing = await prisma.whatsAppJob.findUnique({ where: { id: jobId } });
  if (!existing) return jsonError("Job not found", 404);

  await prisma.whatsAppJob.delete({ where: { id: jobId } });

  return jsonOk({ ok: true, deleted: jobId });
}
