import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { generateInventoryAiProfile } from "@/lib/inventoryAiProfile/generateProfile";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";
import { getAiQueueSnapshot } from "@/lib/inventoryAiProfile/queue";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const total = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const indexed = await prisma.inventoryAiProfile.count({
    where: {
      status: "completed",
    },
  });
  const vectorRows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM inventory_ai_profiles WHERE embedding_vector IS NOT NULL`,
  );

  return jsonOk({
    total,
    indexed,
    pending: total - indexed,
    pipelineVersion: 1,
    engine: "openai_pgvector_hybrid_v1",
    vectorIndexed: vectorRows[0]?.count || 0,
    queue: getAiQueueSnapshot(),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    itemIds?: number[];
  };

  if (body.itemIds?.length) {
    let processed = 0;
    let failed = 0;
    for (const itemId of body.itemIds) {
      try {
        await generateInventoryAiProfile(itemId, "full", "admin_selected_rebuild");
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    return jsonOk({
      processed,
      failed,
      message: `Rebuilt ${processed} items. ${failed} failed.`,
    });
  }

  const items = await prisma.clothingItem.findMany({
    where: body.force === true
      ? { photo: { not: null }, NOT: { photo: "" } }
      : {
          photo: { not: null },
          NOT: { photo: "" },
          OR: [{ aiProfile: { is: null } }, { aiProfile: { is: { status: { in: ["none", "failed"] } } } }],
        },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  items.forEach((item) => scheduleInventoryAiProfile(item.id, "full", "admin_bulk_rebuild"));
  return jsonOk({
    queued: items.length,
    message: `Queued ${items.length} AI profile rebuild jobs.`,
  });
}
