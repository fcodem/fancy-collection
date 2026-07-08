import { NextRequest } from "next/server";
import { saveProfileOverrides } from "@/lib/inventoryAiProfile/service";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const ctErr = requireJsonContentType(req);
  if (ctErr) return ctErr;

  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (!Number.isFinite(itemId)) return jsonError("Invalid item id", 400);

  const item = await prisma.clothingItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) return jsonError("Item not found", 404);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body", 400);

  const profile = await saveProfileOverrides(
    itemId,
    {
      description: body.description ?? undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      colourAnalysis: body.colourAnalysis ?? undefined,
      garmentAttributes: body.garmentAttributes ?? undefined,
      jewelleryAttributes: body.jewelleryAttributes ?? undefined,
      category: body.category ?? undefined,
      subCategory: body.subCategory ?? undefined,
      qualityNotes: body.qualityNotes ?? undefined,
    },
    user.username,
  );

  return jsonOk({ ok: true, profile });
}
