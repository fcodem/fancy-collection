import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const body = (await req.json().catch(() => ({}))) as { itemId?: number };
  if (body.itemId) {
    const item = await prisma.clothingItem.findUnique({
      where: { id: Number(body.itemId) },
      select: { id: true, photo: true },
    });
    if (!item?.photo) return jsonError("Item photo not found", 404);
    scheduleInventoryAiProfile(item.id, "full", "enhancement_retry");
    return jsonOk({ ok: true, queued: 1 });
  }

  const failed = await prisma.clothingItem.findMany({
    where: { enhancementStatus: "failed", photo: { not: null } },
    select: { id: true },
    take: 100,
  });
  failed.forEach((item) => scheduleInventoryAiProfile(item.id, "full", "enhancement_bulk_retry"));
  return jsonOk({ ok: true, queued: failed.length });
}
