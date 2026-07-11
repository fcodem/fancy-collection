/**
 * POST /api/ai-tools/image-enhancer/preview
 *
 * Pipeline 2 manual preview endpoint.
 * Applies the SAME strict background-replacement-only prompt used by the
 * automatic pipeline. The owner can use this to test or manually re-enhance
 * any inventory item.
 *
 * FormData:
 *   image: File
 *   itemId?: string   (optional — used for logging only)
 */
import { NextRequest } from "next/server";
import sharp from "sharp";
import { enhanceInventoryImage } from "@/lib/ai/openaiVision";
import { buildEnhancementPrompt, enhancementStyleLabel } from "@/lib/ai/enhancementPrompts";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const rateKey = `${user.username}:${req.headers.get("x-forwarded-for") || "local"}:ai-enhancer`;
  const rate = enforceRateLimit(rateKey, 10, 60_000);
  if (!rate.allowed) return jsonError("Too many enhancement requests. Please retry shortly.", 429);

  try {
    const form = await req.formData();
    const image = form.get("image");
    const category = String(form.get("category") || "Lehenga");
    const itemType = String(form.get("itemType") || "womens");

    if (!(image instanceof File)) return jsonError("Image is required", 400);
    if (image.size <= 0 || image.size > MAX_BYTES) {
      return jsonError("Image must be between 1 byte and 20 MB", 400);
    }

    const raw = Buffer.from(await image.arrayBuffer());

    // Preserve orientation and convert — do NOT downscale significantly here;
    // the openaiVision layer handles size limits.
    const normalized = await sharp(raw)
      .rotate()
      .jpeg({ quality: 95 })
      .toBuffer();

    const prompt = buildEnhancementPrompt(category, itemType);
    const styleLabel = enhancementStyleLabel(category, itemType);

    const enhanced = await enhanceInventoryImage(normalized, prompt);
    return jsonOk({
      ok: true,
      enhancedBase64: enhanced.enhancedBuffer.toString("base64"),
      mimeType: "image/jpeg",
      latencyMs: enhanced.latencyMs,
      model: enhanced.model,
      styleLabel,
      category,
      itemType,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Enhancement failed", 500);
  }
}
