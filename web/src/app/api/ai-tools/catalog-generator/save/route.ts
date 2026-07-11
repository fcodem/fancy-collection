/**
 * POST /api/ai-tools/catalog-generator/save
 * Saves a base64-encoded marketing image as the marketingPhoto for an inventory item.
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { saveCompressedFromBuffer } from "@/lib/upload";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = (await req.json()) as { itemId?: number; base64?: string };
    const { itemId, base64 } = body;
    if (!itemId || !base64) return jsonError("itemId and base64 are required", 400);

    const item = await prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) return jsonError("Inventory item not found", 404);

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) return jsonError("Image data is empty", 400);

    const savedPath = await saveCompressedFromBuffer(buffer, "marketing");
    if (!savedPath) return jsonError("Failed to save image", 500);

    await prisma.clothingItem.update({
      where: { id: itemId },
      data: { marketingPhoto: savedPath },
    });

    return jsonOk({ ok: true, savedPath });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Save failed", 500);
  }
}
