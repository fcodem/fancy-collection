import { NextRequest } from "next/server";
import { createInventoryItem } from "@/lib/services/inventoryOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { InventoryItemSchema } from "@/lib/validation";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus } from "@/lib/inventoryPhotoPipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError(
        "Upload too large or incomplete. Use a smaller photo (under ~4 MB) and try again.",
        413,
      );
    }
    const photo = form.get("photo");
    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto && process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      return jsonError(
        "Photo storage is not configured on this deployment. Set BLOB_READ_WRITE_TOKEN in Vercel Environment Variables (Production), then Redeploy.",
        500,
      );
    }
    const parseResult = InventoryItemSchema.omit({ sku: true }).safeParse({
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      size: String(form.get("size") || "") || undefined,
      color: String(form.get("color") || "") || undefined,
      dailyRate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
    });
    if (!parseResult.success) {
      return jsonError(parseResult.error.issues[0]?.message || "Invalid input", 400);
    }
    const sizes = form.getAll("sizes[]").map(String);
    const items = await createInventoryItem(
      {
        name: String(form.get("name") || ""),
        category: String(form.get("category") || ""),
        sizes: sizes.length ? sizes : undefined,
        size: String(form.get("size") || ""),
        color: String(form.get("color") || ""),
        daily_rate: Number(form.get("daily_rate") || 0),
        deposit: Number(form.get("deposit") || 0),
        condition_notes: String(form.get("condition_notes") || ""),
        sub_category: String(form.get("sub_category") || "Normal"),
        photo: hasPhoto ? (photo as File) : null,
        quantity: Number(form.get("quantity") || 1),
        has_necklace: form.get("has_necklace") === "1",
        has_earrings: form.get("has_earrings") === "1",
        has_teeka: form.get("has_teeka") === "1",
        has_pasa: form.get("has_pasa") === "1",
      },
      user.username,
    );
    const primary = items[0];
    const pipeline = primary ? computePipelineStatus(primary) : null;
    return jsonOk({
      ok: true,
      count: items.length,
      ids: items.map((i) => i.id),
      id: primary?.id,
      sku: primary?.sku ?? "",
      name: primary?.name ?? "",
      original_photo_url: primary ? photoUrl(primary.photo) : "",
      display_photo_url: pipeline?.display_photo_url || "",
      pipeline,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add item";
    console.error("[api/inventory POST]", message);
    return jsonError(message, 500);
  }
}
