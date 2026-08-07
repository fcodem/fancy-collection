import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { saveFastInventoryPhotoWithThumb } from "@/lib/upload";
import { logActivity, snapshotInventory } from "@/lib/activityLog";
import { pickInventorySyncMatch, normalizeSyncDressName } from "@/lib/imageSyncMatch";
import { enqueueInventoryPhotoJobsDurable } from "@/lib/inventoryPhotoPipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (isResponse(owner)) return owner;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const rawName = normalizeSyncDressName(String(form.get("name") || ""));

    if (!file || !rawName) {
      return jsonError("Missing file or name", 400);
    }
    if (file.size <= 0) {
      return jsonError("Empty image file", 400);
    }

    const candidates = await prisma.clothingItem.findMany({
      select: { id: true, name: true, sku: true, photo: true, thumbnailPhoto: true },
      orderBy: { id: "asc" },
    });

    const item = pickInventorySyncMatch(rawName, candidates);
    if (!item) {
      return jsonError(`No inventory match for "${rawName}"`, 404);
    }

    const { photo: storedPath, thumbnailPhoto } = await saveFastInventoryPhotoWithThumb(file);
    const thumbRef = thumbnailPhoto || storedPath;

    const fullItem = await prisma.clothingItem.findUnique({
      where: { id: item.id },
    });
    const beforeSnap = snapshotInventory(
      (fullItem ?? item) as unknown as Record<string, unknown>,
    );

    await prisma.clothingItem.update({
      where: { id: item.id },
      data: {
        photo: storedPath,
        thumbnailPhoto: thumbRef,
        identificationIndexedAt: null,
        aiIndexedAt: null,
      },
    });

    await enqueueInventoryPhotoJobsDurable([item.id], "bulk_image_sync_photo_replaced");

    logActivity({
      username: owner.username,
      action: "updated",
      entity: "inventory",
      entityId: item.id,
      label: `Bulk image sync — ${item.name}${item.sku ? ` (${item.sku})` : ""}`,
      before: beforeSnap,
      after: { ...beforeSnap, photo: storedPath, thumbnailPhoto: thumbRef },
    });

    return jsonOk({
      matched: true,
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      photo: storedPath,
      thumbnailPhoto: thumbRef,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    console.error("[image-sync]", message);
    return jsonError(message, 500);
  }
}
