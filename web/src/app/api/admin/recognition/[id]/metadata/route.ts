import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) return jsonError("Invalid item id", 400);

  const row = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    select: {
      itemId: true,
      status: true,
      description: true,
      colourAnalysis: true,
      garmentAttributes: true,
      jewelleryAttributes: true,
      qualityScores: true,
      modelVersion: true,
      indexedAt: true,
    },
  });
  if (!row) return jsonError("AI profile not found", 404);
  const extra = await prisma.$queryRawUnsafe<Array<{ prompt_version: string | null; ai_version: string | null }>>(
    `SELECT prompt_version, ai_version FROM inventory_ai_profiles WHERE item_id = $1 LIMIT 1`,
    itemId,
  );
  return jsonOk({
    ok: true,
    metadata: {
      ...row,
      promptVersion: extra[0]?.prompt_version || null,
      aiVersion: extra[0]?.ai_version || null,
    },
  });
}
