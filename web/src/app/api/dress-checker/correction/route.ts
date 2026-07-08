import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { recordDressCheckerCorrection } from "@/lib/dressCheckerCorrections";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const feedbackType = String(form.get("feedback_type") || "positive") as "positive" | "negative";
    const correctItemId = form.get("correct_item_id")
      ? parseInt(String(form.get("correct_item_id")), 10)
      : null;
    const rejectedItemId = form.get("rejected_item_id")
      ? parseInt(String(form.get("rejected_item_id")), 10)
      : null;

    if (!photo || !(photo instanceof File)) return jsonError("Photo required", 400);
    if (feedbackType === "positive" && !correctItemId) return jsonError("correct_item_id required", 400);
    if (feedbackType === "negative" && !rejectedItemId) return jsonError("rejected_item_id required", 400);

    const buffer = Buffer.from(await photo.arrayBuffer());
    const predictedItemId = form.get("predicted_item_id")
      ? parseInt(String(form.get("predicted_item_id")), 10)
      : null;
    const confidence = form.get("confidence") ? Number(form.get("confidence")) : null;
    const hybridScore = form.get("hybrid_score") ? Number(form.get("hybrid_score")) : null;
    let featureComparison: Record<string, unknown> | null = null;
    const fcRaw = form.get("feature_comparison");
    if (fcRaw && typeof fcRaw === "string") {
      try {
        featureComparison = JSON.parse(fcRaw);
      } catch {
        featureComparison = null;
      }
    }

    const row = await recordDressCheckerCorrection(
      {
        correctItemId,
        rejectedItemId,
        predictedItemId,
        predictedSku: String(form.get("predicted_sku") || "") || null,
        confidence,
        hybridScore,
        featureComparison,
        searchId: String(form.get("search_id") || "") || null,
        feedbackType,
      },
      buffer,
      user.username,
    );

    return jsonOk({ ok: true, id: row.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to record correction", 500);
  }
}
