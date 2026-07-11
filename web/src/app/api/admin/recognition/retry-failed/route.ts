import { isResponse, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";

export async function POST() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const failed = await prisma.inventoryAiProfile.findMany({
    where: { status: "failed" },
    select: { itemId: true },
    take: 200,
  });
  failed.forEach((row) => scheduleInventoryAiProfile(row.itemId, "full", "retry_failed_profiles"));
  return jsonOk({ ok: true, queued: failed.length });
}
