import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/services/inventoryOps";
import { dressDisplayName } from "@/lib/dress";
import { photoUrl } from "@/lib/photoUrl";
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
    photo_url: photoUrl(item.photo),
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
    }, user.username);
    return jsonOk({ ok: true, id: item.id });
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
