/**
 * POST /api/ai-tools/catalog-generator
 *
 * Pipeline 3 — Marketing image generation.
 * Creative liberties ARE allowed here.
 * Results are stored as marketingPhoto (never used in inventory/booking display).
 *
 * Body: multipart/form-data
 *   image: File
 *   category: string
 *   style: MarketingStyle
 *   itemId?: string  (optional — save to inventory's marketingPhoto if provided)
 */
import { NextRequest } from "next/server";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import { enhanceInventoryImage } from "@/lib/ai/openaiVision";
import { buildMarketingPrompt, type MarketingStyle } from "@/lib/ai/enhancementPrompts";
import { saveCompressedFromBuffer } from "@/lib/upload";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";

const MAX_BYTES = 10 * 1024 * 1024;
const VALID_STYLES: MarketingStyle[] = [
  "luxury_catalog", "lifestyle", "campaign", "minimal", "wedding",
];

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const rateKey = `${user.username}:${req.headers.get("x-forwarded-for") || "local"}:catalog-gen`;
  const rate = enforceRateLimit(rateKey, 6, 60_000);
  if (!rate.allowed) return jsonError("Rate limit reached. Please wait before generating more images.", 429);

  try {
    const form = await req.formData();
    const image = form.get("image");
    const category = String(form.get("category") || "Lehenga");
    const rawStyle = String(form.get("style") || "luxury_catalog");
    const style: MarketingStyle = VALID_STYLES.includes(rawStyle as MarketingStyle)
      ? (rawStyle as MarketingStyle)
      : "luxury_catalog";
    const itemIdStr = form.get("itemId");

    if (!(image instanceof File)) return jsonError("Image file is required", 400);
    if (image.size <= 0 || image.size > MAX_BYTES) {
      return jsonError("Image must be between 1 byte and 10 MB", 400);
    }

    const raw = Buffer.from(await image.arrayBuffer());
    const normalized = await sharp(raw)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    const prompt = buildMarketingPrompt(category, style);
    const result = await enhanceInventoryImage(normalized, prompt);

    let savedPath: string | null = null;
    if (itemIdStr) {
      const itemId = parseInt(itemIdStr.toString(), 10);
      if (!isNaN(itemId) && itemId > 0) {
        const item = await prisma.clothingItem.findUnique({ where: { id: itemId } });
        if (item) {
          savedPath = await saveCompressedFromBuffer(result.enhancedBuffer, "marketing");
          await prisma.clothingItem.update({
            where: { id: itemId },
            data: { marketingPhoto: savedPath },
          });
        }
      }
    }

    return jsonOk({
      ok: true,
      enhancedBase64: result.enhancedBuffer.toString("base64"),
      mimeType: "image/jpeg",
      latencyMs: result.latencyMs,
      model: result.model,
      style,
      category,
      savedPath,
    });
  } catch (err) {
    console.error("[catalog-generator] failed:", err);
    return jsonError(err instanceof Error ? err.message : "Generation failed", 500);
  }
}
