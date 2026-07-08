import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { checkInventoryDuplicate } from "@/lib/dressChecker/duplicateDetection";
import { validateDressCheckerImage } from "@/lib/dressCheckerValidation";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const category = String(form.get("category") || "");
    const excludeId = form.get("exclude_id");

    if (!(photo instanceof File) || photo.size === 0) {
      return jsonError("Photo is required", 400);
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const validation = await validateDressCheckerImage(buffer, photo.type);
    if (!validation.ok) {
      return jsonError(validation.message || "Invalid image", 400);
    }

    const result = await checkInventoryDuplicate(
      buffer,
      category || undefined,
      excludeId ? Number(excludeId) : undefined,
    );

    return jsonOk({
      ok: true,
      is_duplicate: result.isDuplicate,
      threshold: result.threshold,
      checked_count: result.checkedCount,
      match: result.bestMatch
        ? {
            id: result.bestMatch.itemId,
            sku: result.bestMatch.sku,
            name: result.bestMatch.name,
            category: result.bestMatch.category,
            similarity: result.bestMatch.similarity,
            component_scores: result.bestMatch.componentScores,
          }
        : null,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Duplicate check failed");
  }
}
