import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { processInventoryAiProfile, rebuildAllAiProfiles } from "@/lib/dressChecker/processInventory";
import { runDressCheckerRepairJob } from "@/lib/dressChecker/repairJob";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
} from "@/lib/dressChecker/profileReadiness";
import { getDressCheckerIndexStats } from "@/lib/ai/pgvector";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const [stats, byStatus, needsReindex] = await Promise.all([
    getDressCheckerIndexStats(),
    prisma.inventoryAiProfile.groupBy({
      by: ["aiStatus"],
      _count: { itemId: true },
    }),
    prisma.inventoryAiProfile.count({ where: { needsReindex: true } }),
  ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((r) => [r.aiStatus, r._count.itemId]),
  );

  return jsonOk({
    currentVersions: {
      pipeline: CURRENT_PIPELINE_VERSION,
      recognition: CURRENT_RECOGNITION_VERSION,
      matching: CURRENT_MATCHING_VERSION,
    },
    stats,
    statusCounts,
    needsReindex,
    ready: statusCounts.READY ?? 0,
    processing: statusCounts.PROCESSING ?? 0,
    pending: statusCounts.PENDING ?? 0,
    failed: statusCounts.FAILED ?? 0,
    stale: statusCounts.STALE ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as {
    action?: "reindex_one" | "reindex_all" | "reindex_full" | "repair_failed";
    itemId?: number;
  };

  try {
    if (body.action === "reindex_one") {
      const itemId = Number(body.itemId);
      if (!Number.isFinite(itemId)) return jsonError("itemId required", 400);
      const ok = await processInventoryAiProfile(itemId, "admin_reindex_one");
      return jsonOk({
        ok,
        message: ok
          ? `Item ${itemId} is READY`
          : `Item ${itemId} FAILED validation — see indexFailureReason`,
      });
    }

    if (body.action === "repair_failed") {
      const result = await runDressCheckerRepairJob(100);
      return jsonOk({
        ...result,
        message: `Repaired ${result.repaired}, failed ${result.failed} of ${result.scanned}`,
      });
    }

    if (body.action === "reindex_full") {
      const result = await rebuildAllAiProfiles(true);
      return jsonOk({
        ...result,
        message: `Full reindex: ${result.processed} READY, ${result.failed} FAILED`,
      });
    }

    if (body.action === "reindex_all") {
      const result = await rebuildAllAiProfiles(false);
      return jsonOk({
        ...result,
        message: `Reindex incomplete: ${result.processed} READY, ${result.failed} FAILED`,
      });
    }

    return jsonError("Unknown action", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lifecycle action failed";
    console.error("[dress-checker-lifecycle]", e);
    return jsonError(message, 500);
  }
}
