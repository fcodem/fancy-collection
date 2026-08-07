import prisma from "@/lib/prisma";
import {
  jsonError,
  jsonOk,
  requireOwner,
  isResponse,
} from "@/lib/api";
import { saveFastInventoryPhotoWithThumb, deleteUpload } from "@/lib/upload";
import { REFERENCE_PHOTO_LABELS } from "@/lib/dressChecker/constants";
import { enqueueInventoryPhotoJobsDurable } from "@/lib/inventoryPhotoPipeline";
import { photoUrl } from "@/lib/photoUrl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseItemId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return id > 0 ? id : null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const itemId = parseItemId((await ctx.params).id);
  if (!itemId) return jsonError("Invalid item id", 400);

  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, sku: true },
  });
  if (!item) return jsonError("Item not found", 404);

  const photos = await prisma.clothingItemReferencePhoto.findMany({
    where: { itemId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      photo: true,
      label: true,
      sortOrder: true,
      indexedAt: true,
      createdAt: true,
    },
  });

  return jsonOk({
    itemId,
    labels: REFERENCE_PHOTO_LABELS,
    photos: photos.map((p) => ({
      id: p.id,
      label: p.label,
      sortOrder: p.sortOrder,
      indexedAt: p.indexedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      url: photoUrl(p.photo),
      photo: p.photo,
    })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const itemId = parseItemId((await ctx.params).id);
  if (!itemId) return jsonError("Invalid item id", 400);

  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, photo: true },
  });
  if (!item) return jsonError("Item not found", 404);
  if (!item.photo?.trim()) {
    return jsonError("Add a main catalog photo before angle reference photos.", 400);
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const labelRaw = String(form.get("label") || "front").trim().toLowerCase();
    const label = REFERENCE_PHOTO_LABELS.includes(
      labelRaw as (typeof REFERENCE_PHOTO_LABELS)[number],
    )
      ? labelRaw
      : "front";

    if (!(file instanceof File) || file.size <= 0) {
      return jsonError("Photo file is required", 400);
    }

    const { photo: storedPath } = await saveFastInventoryPhotoWithThumb(file);
    const maxSort = await prisma.clothingItemReferencePhoto.aggregate({
      where: { itemId },
      _max: { sortOrder: true },
    });

    const created = await prisma.clothingItemReferencePhoto.create({
      data: {
        itemId,
        photo: storedPath,
        label,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      select: {
        id: true,
        photo: true,
        label: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    await enqueueInventoryPhotoJobsDurable([itemId], "reference_photo_added");

    return jsonOk({
      ok: true,
      photo: {
        id: created.id,
        label: created.label,
        sortOrder: created.sortOrder,
        url: photoUrl(created.photo),
        photo: created.photo,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return jsonError(message, 500);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const itemId = parseItemId((await ctx.params).id);
  if (!itemId) return jsonError("Invalid item id", 400);

  let refId = 0;
  try {
    const body = (await req.json()) as { refId?: number };
    refId = Number(body.refId);
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!refId) return jsonError("refId is required", 400);

  const row = await prisma.clothingItemReferencePhoto.findFirst({
    where: { id: refId, itemId },
    select: { id: true, photo: true },
  });
  if (!row) return jsonError("Reference photo not found", 404);

  await prisma.clothingItemReferencePhoto.delete({ where: { id: row.id } });
  await deleteUpload(row.photo, { allowInventoryReplacement: true }).catch(() => undefined);
  await enqueueInventoryPhotoJobsDurable([itemId], "reference_photo_removed");

  return jsonOk({ ok: true, deleted: row.id });
}
