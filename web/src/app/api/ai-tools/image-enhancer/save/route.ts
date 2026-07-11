/**
 * POST /api/ai-tools/image-enhancer/save
 *
 * Saves a base64-encoded enhanced image as the enhancedPhoto for a given
 * inventory item, or saves it as a brand-new standalone enhanced photo.
 *
 * Body (JSON):
 *   { itemId: number, enhancedBase64: string, mimeType?: string }
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { saveCompressedFromBuffer } from "@/lib/upload";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = (await req.json()) as {
      itemId?: number;
      enhancedBase64?: string;
      mimeType?: string;
    };

    const { itemId, enhancedBase64 } = body;
    if (!itemId || !enhancedBase64) {
      return jsonError("itemId and enhancedBase64 are required", 400);
    }

    const item = await prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) return jsonError("Inventory item not found", 404);

    const buffer = Buffer.from(enhancedBase64, "base64");
    if (!buffer.length) return jsonError("Enhanced image data is empty", 400);

    const savedPath = await saveCompressedFromBuffer(buffer, "enhanced");
    if (!savedPath) return jsonError("Failed to save enhanced image", 500);

    const now = new Date();
    await prisma.clothingItem.update({
      where: { id: itemId },
      data: {
        enhancedPhoto: savedPath,
        enhancementStatus: "completed",
        enhancementError: null,
        enhancementCompletedAt: now,
        lastEnhancedAt: now,
        enhancementUpdatedAt: now,
        // Backfill originalPhoto if not set
        ...(!item.originalPhoto && item.photo ? { originalPhoto: item.photo } : {}),
      },
    });

    return jsonOk({ ok: true, enhancedPhoto: savedPath });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Save failed", 500);
  }
}
