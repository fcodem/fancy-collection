import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { checkInventoryDuplicate } from "@/lib/dressChecker/duplicateDetection";
import { validateDressCheckerImage } from "@/lib/dressCheckerValidation";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

export async function POST(req: NextRequest) {
  const perf = createPerfTimer("POST /api/inventory/duplicate-check");
  perf.mark("auth");
  const user = await requireOwner();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  try {
    perf.mark("parse");
    const form = await req.formData();
    perf.endStage("parseMs", "parse");
    const photo = form.get("photo");
    const category = String(form.get("category") || "");
    const excludeId = form.get("exclude_id");

    if (!(photo instanceof File) || photo.size === 0) {
      return jsonError("Photo is required", 400);
    }
    if (photo.size > 8 * 1024 * 1024) {
      return jsonError("Photo must be under 8 MB for duplicate check", 400);
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const validation = await validateDressCheckerImage(buffer, photo.type);
    if (!validation.ok) {
      return jsonError(validation.message || "Invalid image", 400);
    }

    let result;
    try {
      perf.mark("dup");
      result = await checkInventoryDuplicate(
        buffer,
        category || undefined,
        excludeId ? Number(excludeId) : undefined,
      );
      perf.endStage("duplicateCheckMs", "dup");
    } catch (e) {
      console.error("[duplicate-check] analysis failed (inventory save must continue independently):", e);
      return jsonError(
        "Duplicate check could not complete. You can still save the dress — retry check later.",
        503,
      );
    }

    const timings = perf.finish({ kind: "photo" });
    return withServerTiming(
      jsonOk({
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
      }),
      timings,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Duplicate check failed";
    return jsonError(message, 500);
  }
}
