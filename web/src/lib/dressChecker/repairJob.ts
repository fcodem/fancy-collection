/**
 * Nightly / periodic self-healing for incomplete dress-checker profiles.
 */
import { findProfilesNeedingRepair } from "./profileLifecycle";
import { processInventoryAiProfile } from "./processInventory";
import prisma from "../prisma";

export type RepairJobResult = {
  scanned: number;
  repaired: number;
  failed: number;
  itemIds: number[];
};

export async function runDressCheckerRepairJob(limit = 50): Promise<RepairJobResult> {
  const itemIds = await findProfilesNeedingRepair(limit);
  let repaired = 0;
  let failed = 0;

  for (const itemId of itemIds) {
    try {
      const ok = await processInventoryAiProfile(itemId, "nightly_repair");
      await prisma.inventoryAiProfile.update({
        where: { itemId },
        data: { autoRepairCount: { increment: 1 } },
      });
      if (ok) repaired++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[dress-repair] item=${itemId}`, err);
    }
  }

  console.log(
    `[dress-repair] scanned=${itemIds.length} repaired=${repaired} failed=${failed}`,
  );
  return { scanned: itemIds.length, repaired, failed, itemIds };
}
