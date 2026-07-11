import { NextRequest, NextResponse } from "next/server";
import { confirmSameDressPair } from "@/lib/dressChecker/positivePairLearning";
import { saveCorrectionPhoto } from "@/lib/dressCheckerCorrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dress-checker/confirm-same-dress
 * Admin confirms "this is the same dress" → positive pair + reference reindex.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const itemId = Number(form.get("itemId") || form.get("correctItemId"));
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ ok: false, error: "itemId required" }, { status: 400 });
    }

    const photo = form.get("photo") || form.get("queryPhoto");
    if (!(photo instanceof File)) {
      return NextResponse.json({ ok: false, error: "photo required" }, { status: 400 });
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const queryPhotoRelPath = await saveCorrectionPhoto(buffer);
    const queryType = String(form.get("queryType") || "") || null;
    const confidence = form.get("confidence") ? Number(form.get("confidence")) : null;
    const confirmedBy = String(form.get("confirmedBy") || form.get("user") || "") || null;
    const searchId = String(form.get("searchId") || "") || null;
    const catalogPhoto = String(form.get("catalogPhoto") || "") || null;
    const identifiersRaw = String(form.get("matchedIdentifiers") || "");
    let matchedIdentifiers: string[] = [];
    try {
      matchedIdentifiers = identifiersRaw ? JSON.parse(identifiersRaw) : [];
    } catch {
      matchedIdentifiers = identifiersRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const result = await confirmSameDressPair({
      itemId,
      queryPhotoRelPath,
      catalogPhotoRelPath: catalogPhoto,
      queryType,
      confidence,
      matchedIdentifiers,
      confirmedBy,
      searchId,
      source: "admin_confirm",
    });

    return NextResponse.json({
      ok: true,
      pairId: result.pairId,
      referenceAdded: result.referenceAdded,
      message: "Same-dress pair saved. Cross-view matching will improve after reindex.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "confirm_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
