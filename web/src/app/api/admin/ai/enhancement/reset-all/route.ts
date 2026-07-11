/**
 * POST /api/admin/ai/enhancement/reset-all
 *
 * Clears enhancedPhoto fields and re-queues AI profile jobs.
 * While Pipeline 2 is paused (enhancementFeatureFlags), re-queue only
 * refreshes metadata from the uploaded image — it does not call image enhancement.
 *
 * Kept for future use when auto-enhancement is re-enabled.
 */
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";
import { isAutoImageEnhancementEnabled } from "@/lib/ai/enhancementFeatureFlags";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";

export async function POST() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  if (!isAutoImageEnhancementEnabled()) {
    return jsonError(
      "Auto image enhancement is paused. Inventory keeps the uploaded photo and still collects metadata. Re-enable in enhancementFeatureFlags.ts (or AI_AUTO_IMAGE_ENHANCEMENT=1) to use this.",
      409,
    );
  }

  // Reset all items that have been enhanced (so they get re-processed)
  await prisma.clothingItem.updateMany({
    where: {
      enhancementStatus: { in: ["completed", "failed"] },
      photo: { not: null },
    },
    data: {
      enhancedPhoto: null,
      enhancementStatus: "none",
      enhancementError: null,
    },
  });

  // Re-queue all items that have a photo for enhancement
  const items = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: { id: true },
    take: 500,
  });

  for (const item of items) {
    scheduleInventoryAiProfile(item.id, "full", "prompt_reset_reenhance");
  }

  return jsonOk({ ok: true, queued: items.length });
}
