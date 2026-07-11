import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) return jsonError("Invalid item id", 400);

  const profile = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!profile) return jsonError("AI profile not found", 404);
  const latest = profile.versions[0];
  return jsonOk({
    ok: true,
    embedding: latest?.embeddings || null,
    hasVector: true,
    indexedAt: profile.indexedAt,
  });
}
