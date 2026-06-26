import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { saveUpload } from "@/lib/upload";
import { logActivity, snapshotInventory } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const rawName = (form.get("name") as string)?.trim();

  if (!file || !rawName) {
    return jsonError("Missing file or name", 400);
  }

  const item = await prisma.clothingItem.findFirst({
    where: {
      name: { equals: rawName },
    },
    select: { id: true, name: true, sku: true, photo: true },
  });

  if (!item) {
    return jsonError(`No inventory match for "${rawName}"`, 404);
  }

  const storedPath = await saveUpload(file);

  const beforeSnap = snapshotInventory(item as unknown as Record<string, unknown>);

  await prisma.clothingItem.update({
    where: { id: item.id },
    data: { photo: storedPath },
  });

  logActivity({
    username: owner.username,
    action: "updated",
    entity: "inventory",
    entityId: item.id,
    label: `Bulk image sync — ${item.name}${item.sku ? ` (${item.sku})` : ""}`,
    before: beforeSnap,
    after: { ...beforeSnap, photo: storedPath },
  });

  return jsonOk({
    matched: true,
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    photo: storedPath,
  });
}
