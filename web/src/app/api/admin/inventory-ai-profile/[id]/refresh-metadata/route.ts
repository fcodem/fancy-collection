import { NextRequest } from "next/server";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) return jsonError("Invalid item id", 400);

  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, photo: true },
  });
  if (!item) return jsonError("Item not found", 404);
  if (!item.photo) return jsonError("Item has no photo", 400);

  scheduleInventoryAiProfile(itemId, "metadata", "admin_refresh_metadata");
  return jsonOk({ ok: true, queued: true, itemId, mode: "metadata" });
}
