import { NextRequest, NextResponse } from "next/server";
import {
  confirmSameDressPair,
  recordNegativePair,
  recordAdminFeedback,
} from "@/lib/dressChecker/positivePairLearning";
import { saveCorrectionPhoto } from "@/lib/dressCheckerCorrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dress-checker/feedback
 * Body (multipart or JSON):
 *   feedback: correct | reject | same_collection
 *   itemId / rejectedItemId / correctItemId
 *   photo (optional)
 *   searchId, notes, confirmedBy
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let feedback = "";
    let itemId: number | null = null;
    let rejectedItemId: number | null = null;
    let searchId: string | null = null;
    let notes: string | null = null;
    let confirmedBy: string | null = null;
    let photoRel: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      feedback = String(form.get("feedback") || "");
      itemId = Number(form.get("itemId") || form.get("correctItemId") || 0) || null;
      rejectedItemId = Number(form.get("rejectedItemId") || form.get("predictedItemId") || 0) || null;
      searchId = String(form.get("searchId") || "") || null;
      notes = String(form.get("notes") || "") || null;
      confirmedBy = String(form.get("confirmedBy") || form.get("user") || "") || null;
      const photo = form.get("photo");
      if (photo instanceof File) {
        photoRel = await saveCorrectionPhoto(Buffer.from(await photo.arrayBuffer()));
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      feedback = String(body.feedback || "");
      itemId = Number(body.itemId || body.correctItemId || 0) || null;
      rejectedItemId = Number(body.rejectedItemId || body.predictedItemId || 0) || null;
      searchId = body.searchId ? String(body.searchId) : null;
      notes = body.notes ? String(body.notes) : null;
      confirmedBy = body.confirmedBy ? String(body.confirmedBy) : null;
      photoRel = body.queryPhoto ? String(body.queryPhoto) : null;
    }

    if (!feedback) {
      return NextResponse.json({ ok: false, error: "feedback required" }, { status: 400 });
    }

    if (feedback === "correct" || feedback === "same_dress") {
      if (!itemId || !photoRel) {
        return NextResponse.json(
          { ok: false, error: "itemId and photo required for correct feedback" },
          { status: 400 },
        );
      }
      const result = await confirmSameDressPair({
        itemId,
        queryPhotoRelPath: photoRel,
        searchId,
        confirmedBy,
        source: "admin_feedback",
      });
      return NextResponse.json({ ok: true, type: "positive", ...result });
    }

    if (feedback === "reject" || feedback === "same_collection") {
      if (!rejectedItemId && !itemId) {
        return NextResponse.json(
          { ok: false, error: "rejectedItemId required" },
          { status: 400 },
        );
      }
      const id = rejectedItemId || itemId!;
      const pairId = await recordNegativePair({
        rejectedItemId: id,
        queryPhotoRelPath: photoRel,
        reason: notes || (feedback === "same_collection" ? "same_collection_lookalike" : "admin_reject"),
        confirmedBy,
        searchId,
        source: feedback === "same_collection" ? "same_collection" : "admin_reject",
      });
      return NextResponse.json({ ok: true, type: "negative", pairId });
    }

    await recordAdminFeedback({
      itemId,
      searchId,
      feedback,
      notes,
      queryPhoto: photoRel,
      createdBy: confirmedBy,
    });

    return NextResponse.json({ ok: true, type: "feedback" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "feedback_failed" },
      { status: 500 },
    );
  }
}
