import { NextRequest } from "next/server";
import { createInventoryItem } from "@/lib/services/inventoryOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const form = await req.formData();
    const sizes = form.getAll("sizes[]").map(String);
    const photo = form.get("photo");
    const items = await createInventoryItem({
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      sizes: sizes.length ? sizes : undefined,
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      condition_notes: String(form.get("condition_notes") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      photo: photo instanceof File && photo.size > 0 ? photo : null,
      quantity: Number(form.get("quantity") || 1),
    }, user.username);
    return jsonOk({ ok: true, count: items.length, ids: items.map((i) => i.id) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to add item");
  }
}
