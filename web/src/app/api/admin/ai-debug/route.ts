import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  runEmbeddingTest,
  runItemSearchTest,
  runOpenAiTest,
  runPgvectorTest,
} from "@/lib/ai/aiDebugTests";
import { getDressCheckerIndexStats, isPgvectorAvailable } from "@/lib/ai/pgvector";
import { processInventoryAiProfile } from "@/lib/dressChecker/processInventory";
import { processInventoryEmbedding } from "@/lib/ai/imageEmbedding/processInventoryEmbedding";
import { toDressCheckerFields } from "@/lib/inventoryAiProfile/dressCheckerFields";
import { getDressCheckerSearchHealth } from "@/lib/dressChecker/searchHealth";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const [pgvector, stats, searchHealth] = await Promise.all([
    isPgvectorAvailable(),
    getDressCheckerIndexStats(),
    getDressCheckerSearchHealth(),
  ]);

  const totalInventory = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });

  const profiles = await prisma.inventoryAiProfile.findMany({
    orderBy: { itemId: "asc" },
    take: 500,
    select: {
      itemId: true,
      status: true,
      photoHash: true,
      differenceHash: true,
      colorHistogram: true,
      verificationMetadata: true,
      imageEmbeddingJson: true,
      modelVersion: true,
      lastProcessed: true,
      reindexedAt: true,
      processingError: true,
      error: true,
      indexedAt: true,
    },
  });

  const pgOk = await isPgvectorAvailable();
  let embeddingItemIds = new Set<number>();
  if (pgOk) {
    const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
      `SELECT item_id FROM inventory_ai_profiles WHERE embedding_vector IS NOT NULL`,
    );
    embeddingItemIds = new Set(rows.map((r) => r.item_id));
  } else {
    const rows = await prisma.inventoryAiProfile.findMany({
      where: { imageEmbeddingJson: { not: Prisma.DbNull } },
      select: { itemId: true },
    });
    embeddingItemIds = new Set(rows.map((r) => r.itemId));
  }

  const items = profiles.map((p) => {
    const dressChecker = toDressCheckerFields(p, embeddingItemIds.has(p.itemId));
    return {
      itemId: p.itemId,
      status: p.status,
      embeddingExists: dressChecker.hasEmbedding,
      embeddingSource: dressChecker.embeddingSource,
      hashExists: !!(p.photoHash && p.differenceHash),
      lastProcessed: p.lastProcessed?.toISOString() ?? null,
      failureReason: dressChecker.processingError || p.error || null,
      modelVersion: p.modelVersion,
      reindexedAt: dressChecker.reindexedAt,
    };
  });

  return jsonOk({
    pgvector,
    searchHealth,
    stats: { ...stats, totalInventory },
    items,
  });
}

type DebugAction =
  | "retry"
  | "reindex"
  | "bulk_rebuild"
  | "embedding_retry"
  | "openai_test"
  | "pgvector_test"
  | "embedding_test"
  | "search_test";

export async function POST(req: Request) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as {
    action?: DebugAction;
    itemId?: number;
    itemIds?: number[];
  };

  if (body.action === "openai_test") {
    const result = await runOpenAiTest();
    return result.ok ? jsonOk(result) : jsonError(result.message, 400);
  }

  if (body.action === "pgvector_test") {
    const result = await runPgvectorTest();
    return result.ok ? jsonOk(result) : jsonError(result.message, 400);
  }

  if (body.action === "embedding_test") {
    const result = await runEmbeddingTest(body.itemId ? Number(body.itemId) : undefined);
    return result.ok ? jsonOk(result) : jsonError(result.message, 400);
  }

  if (body.action === "search_test") {
    const id = Number(body.itemId);
    if (!id) return jsonError("itemId required", 400);
    const result = await runItemSearchTest(id);
    return result.ok ? jsonOk(result) : jsonError(result.error || "Search test failed", 400);
  }

  if (body.action === "retry" || body.action === "reindex" || body.action === "embedding_retry") {
    const id = Number(body.itemId);
    if (!id) return jsonError("itemId required", 400);
    try {
      if (body.action === "reindex") {
        await processInventoryAiProfile(id, "admin_reindex");
      } else {
        const ok = await processInventoryEmbedding(
          id,
          body.action === "retry" ? "admin_retry" : "admin_embedding_retry",
        );
        if (!ok) return jsonError("Embedding generation failed — check failure reason", 500);
      }
      return jsonOk({ ok: true, itemId: id });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Action failed", 500);
    }
  }

  if (body.action === "bulk_rebuild") {
    const ids =
      body.itemIds?.length
        ? body.itemIds
        : (
            await prisma.clothingItem.findMany({
              where: { photo: { not: null }, NOT: { photo: "" } },
              select: { id: true },
            })
          ).map((i) => i.id);

    for (const id of ids.slice(0, 200)) {
      const { scheduleInventoryAiProfile } = await import("@/lib/dressChecker/processInventory");
      scheduleInventoryAiProfile(id, "admin_bulk_rebuild");
    }
    return jsonOk({ ok: true, queued: Math.min(ids.length, 200) });
  }

  return jsonError("Unknown action", 400);
}
