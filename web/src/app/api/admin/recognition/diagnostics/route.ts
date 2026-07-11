import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";
import { getDressCheckerIndexStats, isPgvectorAvailable } from "@/lib/ai/pgvector";
import { toDressCheckerFields } from "@/lib/inventoryAiProfile/dressCheckerFields";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const itemIdParam = req.nextUrl.searchParams.get("itemId");
  if (itemIdParam) {
    const itemId = Number(itemIdParam);
    if (!Number.isFinite(itemId)) return jsonError("Invalid itemId", 400);
    const profile = await prisma.inventoryAiProfile.findUnique({
      where: { itemId },
      include: {
        logs: { orderBy: { createdAt: "desc" }, take: 25 },
        versions: { orderBy: { version: "desc" }, take: 5 },
      },
    });
    if (!profile) return jsonError("Profile not found", 404);

    const pgOk = await isPgvectorAvailable();
    let hasPgvectorEmbedding = false;
    if (pgOk) {
      const rows = await prisma.$queryRawUnsafe<Array<{ has: boolean }>>(
        `SELECT embedding_vector IS NOT NULL AS has FROM inventory_ai_profiles WHERE item_id = $1`,
        itemId,
      );
      hasPgvectorEmbedding = !!rows[0]?.has;
    }

    return jsonOk({
      ok: true,
      profile,
      dressChecker: toDressCheckerFields(profile, hasPgvectorEmbedding),
    });
  }

  const dressCheckerStats = await getDressCheckerIndexStats();
  const [total, completed, processing, failed] = await Promise.all([
    prisma.inventoryAiProfile.count(),
    prisma.inventoryAiProfile.count({ where: { status: "completed" } }),
    prisma.inventoryAiProfile.count({ where: { status: "processing" } }),
    prisma.inventoryAiProfile.count({ where: { status: "failed" } }),
  ]);

  return jsonOk({
    ok: true,
    stats: {
      total,
      completed,
      processing,
      failed,
      dressChecker: dressCheckerStats,
    },
  });
}
