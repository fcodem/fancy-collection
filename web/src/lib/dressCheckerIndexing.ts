import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { logDressChecker } from "./dressCheckerLog";
import { processInventoryFingerprint } from "./recognitionPipeline/processInventory";

export { indexIdentificationFingerprint } from "./services/dressIdentificationPipeline";

/** Clear embeddings + recognition image when inventory photo is removed. */
export async function clearIdentificationIndex(itemId: number, reason: string): Promise<void> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { recognitionImage: true },
  });
  await prisma.clothingItem.update({
    where: { id: itemId },
    data: {
      identificationIndex: Prisma.JsonNull,
      identificationIndexedAt: null,
      siglipEmbedding: Prisma.JsonNull,
      siglipIndexedAt: null,
      recognitionImage: null,
      recognitionFingerprint: Prisma.JsonNull,
    },
  });
  if (item?.recognitionImage) {
    const { deleteUpload } = await import("./upload");
    void deleteUpload(item.recognitionImage);
  }
  logDressChecker({
    timestamp: new Date().toISOString(),
    event: "reindex_clear",
    itemId,
    reason,
  });
  const { onInventoryAiProfilePhotoRemoved } = await import("./inventoryAiProfile/queue");
  onInventoryAiProfilePhotoRemoved(itemId);
}

/**
 * Multi-stage recognition pipeline: garment isolation, feature fingerprint,
 * SigLIP embeddings — stored on InventoryAiProfile + ClothingItem index fields.
 */
export async function runRecognitionPipeline(
  itemId: number,
  _category: string,
  reason: string,
): Promise<void> {
  const row = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { photo: true },
  });
  if (!row?.photo) return;
  await processInventoryFingerprint(itemId, reason);
}

export function onInventoryPhotoChanged(
  itemId: number,
  photo: string | null | undefined,
  category: string,
  action: "created" | "updated" | "replaced",
): void {
  if (!photo) {
    void clearIdentificationIndex(itemId, `photo_${action}_cleared`);
    return;
  }
  setImmediate(() => {
    void import("./recognitionPipeline/processInventory").then(({ scheduleInventoryFingerprint }) => {
      scheduleInventoryFingerprint(itemId, `photo_${action}`);
    });
  });
}

export function onInventoryPhotoRemoved(itemId: number): void {
  void clearIdentificationIndex(itemId, "photo_removed");
}
