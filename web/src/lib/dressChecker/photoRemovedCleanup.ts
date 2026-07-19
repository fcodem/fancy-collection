import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { enqueueBlobCleanup } from "@/lib/blobCleanup";
import { logDressChecker } from "@/lib/dressCheckerLog";

/**
 * Lightweight cleanup used by the inventory mutation route.
 *
 * Keep this module separate from dressCheckerIndexing/processInventory so a
 * photo removal cannot pull transformers/onnxruntime into the business API.
 */
export async function cleanupRemovedInventoryPhoto(itemId: number): Promise<void> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { recognitionImage: true },
  });

  await prisma.$transaction([
    prisma.clothingItem.update({
      where: { id: itemId },
      data: {
        identificationIndex: Prisma.JsonNull,
        identificationIndexedAt: null,
        siglipEmbedding: Prisma.JsonNull,
        siglipIndexedAt: null,
        recognitionImage: null,
        recognitionFingerprint: Prisma.JsonNull,
      },
    }),
    prisma.inventoryAiProfileTag.deleteMany({ where: { itemId } }),
    prisma.inventoryAiProfileOverride.deleteMany({ where: { itemId } }),
    prisma.inventoryAiProfile.updateMany({
      where: { itemId },
      data: {
        status: "none",
        error: null,
        description: null,
        searchText: null,
        colourAnalysis: Prisma.JsonNull,
        garmentAttributes: Prisma.JsonNull,
        jewelleryAttributes: Prisma.JsonNull,
        qualityScores: Prisma.JsonNull,
        duplicateFingerprint: Prisma.JsonNull,
        healthScore: null,
        healthIssues: Prisma.JsonNull,
        enhancedImage: null,
        enhancementStatus: "none",
        enhancementError: null,
        enhancementVersion: 0,
        enhancementModel: null,
        enhancementLatencyMs: null,
      },
    }),
  ]);

  await prisma.$executeRaw`
    UPDATE inventory_ai_profiles
    SET prompt_version = NULL, ai_version = NULL
    WHERE item_id = ${itemId}
  `;
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "none" },
    update: {},
  });
  await prisma.inventoryAiProfileLog.create({
    data: { itemId, event: "reset", message: "Photo removed" },
  });

  if (item?.recognitionImage) {
    await enqueueBlobCleanup([item.recognitionImage], {
      reason: "inventory_photo_removed",
    });
  }

  logDressChecker({
    timestamp: new Date().toISOString(),
    event: "reindex_clear",
    itemId,
    reason: "photo_removed",
  });
}
