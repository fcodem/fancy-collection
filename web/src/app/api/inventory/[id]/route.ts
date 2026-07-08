import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/services/inventoryOps";
import { dressDisplayName } from "@/lib/dress";
import { catalogPhotoUrl, recognitionPhotoUrl } from "@/lib/catalogPhotoUrl";
import { photoUrl } from "@/lib/photoUrl";
import { computePipelineStatus } from "@/lib/inventoryPhotoPipeline";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const item = await prisma.clothingItem.findUnique({ where: { id: parseInt(id, 10) } });
  if (!item) return jsonError("Not found", 404);
  return jsonOk({
    ...item,
    display_name: dressDisplayName(item.name, item.category, item.size),
    photo_url: catalogPhotoUrl(item),
    recognition_photo_url: recognitionPhotoUrl(item),
    original_photo_url: photoUrl(item.photo),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const item = await updateInventoryItem(parseInt(id, 10), {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      size: String(form.get("size") || ""),
      color: String(form.get("color") || ""),
      daily_rate: Number(form.get("daily_rate") || 0),
      deposit: Number(form.get("deposit") || 0),
      condition_notes: String(form.get("condition_notes") || ""),
      status: String(form.get("status") || ""),
      sub_category: String(form.get("sub_category") || "Normal"),
      photo: photo instanceof File && photo.size > 0 ? photo : null,
      remove_photo: form.get("remove_photo") === "1",
      has_necklace: form.get("has_necklace") === "1",
      has_earrings: form.get("has_earrings") === "1",
      has_teeka: form.get("has_teeka") === "1",
      has_pasa: form.get("has_pasa") === "1",
    }, user.username);
    const pipeline = computePipelineStatus(item);
    return jsonOk({
      ok: true,
      id: item.id,
      original_photo_url: photoUrl(item.photo),
      display_photo_url: pipeline.display_photo_url,
      pipeline,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await deleteInventoryItem(parseInt(id, 10), user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Delete failed");
  }
}
