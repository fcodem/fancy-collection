import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import {
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
  JEWELLERY_CATEGORIES,
  ACCESSORY_CATEGORIES,
} from "../constants";
import { dressDisplayName, formatUnitName } from "../dress";
import { saveFastInventoryPhotoWithThumb } from "../upload";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotInventory } from "../activityLog";
import { cleanupRemovedInventoryPhoto } from "../dressChecker/photoRemovedCleanup";
import { enqueueInventoryPhotoJobsDurable } from "../inventoryPhotoPipeline";
import { enqueueBlobCleanup } from "../blobCleanup";
import { generateUuidV4 } from "../clientUuid";
import { allocateInventorySkusWithClient } from "../inventorySkuAllocator";

function itemTypeForCategory(category: string) {
  if (JEWELLERY_CATEGORIES.includes(category)) return "jewellery";
  if (ACCESSORY_CATEGORIES.includes(category)) return "accessory";
  return "clothing";
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function unreferencedInventoryPhotoPaths(
  client: DbClient,
  paths: Array<string | null | undefined>,
  excludeId?: number,
) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const results = await Promise.all(
    unique.map(async (path) => {
      const references = await client.clothingItem.count({
        where: {
          ...(excludeId ? { id: { not: excludeId } } : {}),
          OR: [
            { photo: path },
            { thumbnailPhoto: path },
            { originalPhoto: path },
            { enhancedPhoto: path },
            { marketingPhoto: path },
            { recognitionImage: path },
          ],
        },
      });
      return references === 0 ? path : null;
    }),
  );
  return results.filter((path): path is string => Boolean(path));
}

/** Atomically reserve `count` SKU numbers and return formatted ITM-#### values. */
export async function allocateInventorySkus(
  count: number,
  client: DbClient = prisma,
): Promise<string[]> {
  return allocateInventorySkusWithClient(count, client);
}

/** @deprecated Prefer allocateInventorySkus for concurrency safety. */
export async function generateItemSku() {
  const [sku] = await allocateInventorySkus(1);
  return sku;
}

type UnitBase = {
  name: string;
  category: string;
  size: string;
  color: string;
  daily_rate?: number;
  deposit?: number;
  condition_notes?: string;
  itemType: string;
  photo: string;
  thumbnailPhoto?: string | null;
  subCategory: string;
  inventoryGroupId: string;
  hasNecklace?: boolean;
  hasEarrings?: boolean;
  hasTeeka?: boolean;
  hasPasa?: boolean;
};

function buildUnitRows(base: UnitBase, quantity: number, skus: string[]) {
  const baseName = base.name.trim();
  const count = Math.max(1, Math.min(quantity, 50));
  if (skus.length < count) throw new Error("Insufficient SKUs reserved");
  return Array.from({ length: count }, (_, idx) => {
    const unit = idx + 1;
    return {
      name: formatUnitName(baseName, unit),
      sku: skus[idx]!,
      category: base.category,
      size: base.size,
      color: base.color,
      dailyRate: base.daily_rate || 0,
      deposit: base.deposit || 0,
      conditionNotes: base.condition_notes || "",
      itemType: base.itemType,
      photo: base.photo || null,
      thumbnailPhoto: base.thumbnailPhoto ?? null,
      originalPhoto: base.photo || null,
      subCategory: base.subCategory,
      hasNecklace: base.hasNecklace ?? false,
      hasEarrings: base.hasEarrings ?? false,
      hasTeeka: base.hasTeeka ?? false,
      hasPasa: base.hasPasa ?? false,
      inventoryGroupId: base.inventoryGroupId,
    };
  });
}

async function createInventoryUnitsInTx(
  tx: Prisma.TransactionClient,
  base: UnitBase,
  quantity: number,
) {
  const count = Math.max(1, Math.min(quantity, 50));
  const skus = await allocateInventorySkus(count, tx);
  const rows = buildUnitRows(base, count, skus);
  const created = await tx.clothingItem.createManyAndReturn({ data: rows });
  return created.sort((a, b) => a.sku.localeCompare(b.sku));
}

export type CreateInventoryForm = {
  name: string;
  category: string;
  sizes?: string[];
  size?: string;
  color?: string;
  daily_rate?: number;
  deposit?: number;
  condition_notes?: string;
  sub_category?: string;
  /** Pre-uploaded photo path — preferred for transactional creates. */
  photoPath?: string | null;
  photo?: File | null;
  quantity?: number;
  has_necklace?: boolean;
  has_earrings?: boolean;
  has_teeka?: boolean;
  has_pasa?: boolean;
};

/**
 * Create inventory rows inside an existing transaction (no broadcast/side effects).
 * Upload photo BEFORE calling this.
 */
export async function createInventoryItemInTx(
  tx: Prisma.TransactionClient,
  form: CreateInventoryForm,
  photoFilename: string,
  thumbnailFilename: string | null = null,
): Promise<{ items: Awaited<ReturnType<typeof createInventoryUnitsInTx>>; inventoryGroupId: string }> {
  const itemType = itemTypeForCategory(form.category);
  const subCategory = form.sub_category || "Normal";
  const quantity = Math.max(1, Math.min(Number(form.quantity) || 1, 50));
  const inventoryGroupId = generateUuidV4();
  const partFlags = {
    hasNecklace: !!form.has_necklace,
    hasEarrings: !!form.has_earrings,
    hasTeeka: !!form.has_teeka,
    hasPasa: !!form.has_pasa,
  };

  if (MENS_CATEGORIES.includes(form.category)) {
    const sizes = form.sizes || [];
    if (!sizes.length) throw new Error("Please select at least one size for men's clothing.");
    const total = sizes.length * quantity;
    const skus = await allocateInventorySkus(total, tx);
    const rows: ReturnType<typeof buildUnitRows> = [];
    let skuOffset = 0;
    for (const sz of sizes) {
      const sizeSkus = skus.slice(skuOffset, skuOffset + quantity);
      skuOffset += quantity;
      rows.push(
        ...buildUnitRows(
          {
            name: form.name,
            category: form.category,
            size: sz,
            color: "",
            daily_rate: form.daily_rate,
            deposit: form.deposit,
            condition_notes: form.condition_notes,
            itemType,
            photo: photoFilename,
            thumbnailPhoto: thumbnailFilename,
            subCategory,
            inventoryGroupId,
            ...partFlags,
          },
          quantity,
          sizeSkus,
        ),
      );
    }
    const created = await tx.clothingItem.createManyAndReturn({ data: rows });
    return {
      items: created.sort((a, b) => a.sku.localeCompare(b.sku)),
      inventoryGroupId,
    };
  }

  const units = await createInventoryUnitsInTx(
    tx,
    {
      name: form.name,
      category: form.category,
      size: form.size || "",
      color: WOMENS_CATEGORIES.includes(form.category) ? form.color || "" : "",
      daily_rate: form.daily_rate,
      deposit: form.deposit,
      condition_notes: form.condition_notes,
      itemType,
      photo: photoFilename,
      thumbnailPhoto: thumbnailFilename,
      subCategory,
      inventoryGroupId,
      ...partFlags,
    },
    quantity,
  );
  return { items: units, inventoryGroupId };
}

export async function createInventoryItem(
  form: CreateInventoryForm,
  by?: string,
): Promise<{ items: Awaited<ReturnType<typeof createInventoryUnitsInTx>>; ai_queue_warning: string | null }> {
  let photoFilename = form.photoPath || "";
  let thumbnailFilename: string | null = null;
  if (!photoFilename && form.photo) {
    const saved = await saveFastInventoryPhotoWithThumb(form.photo);
    photoFilename = saved.photo;
    thumbnailFilename = saved.thumbnailPhoto;
  }

  let created: Awaited<ReturnType<typeof createInventoryUnitsInTx>> = [];
  try {
    created = await prisma.$transaction(async (tx) => {
      const { items } = await createInventoryItemInTx(
        tx,
        form,
        photoFilename,
        thumbnailFilename,
      );
      return items;
    });
  } catch (e) {
    if (photoFilename) {
      await enqueueBlobCleanup(
        [photoFilename, thumbnailFilename],
        { reason: "orphan_inventory_create_upload" },
      );
    }
    throw e;
  }

  broadcastShopEvent({ type: "inventory.changed", itemIds: created.map((i) => i.id), by });
  for (const item of created) {
    void logActivity({
      username: by || "system",
      action: "created",
      entity: "inventory",
      entityId: item.id,
      label: `Added ${item.name} (${item.category}, ${item.size || "—"})`,
      after: snapshotInventory(item as unknown as Record<string, unknown>),
    });
  }

  let ai_queue_warning: string | null = null;
  if (photoFilename && created.length) {
    try {
      const queued = await enqueueInventoryPhotoJobsDurable(
        created.map((i) => i.id),
        "photo_created",
      );
      ai_queue_warning = queued.warning;
    } catch (e) {
      console.error("[inventory] durable AI enqueue failed (items kept):", e);
      ai_queue_warning =
        "Inventory saved but AI queue could not be written. Retry from AI indexing.";
    }
  }
  return { items: created, ai_queue_warning };
}

export type UpdateInventoryForm = {
  name: string;
  category: string;
  size?: string;
  color?: string;
  daily_rate?: number;
  deposit?: number;
  condition_notes?: string;
  status?: string;
  sub_category?: string;
  photo?: File | null;
  /** Pre-uploaded photo path (preferred for idempotent routes). */
  photoPath?: string | null;
  remove_photo?: boolean;
  has_necklace?: boolean;
  has_earrings?: boolean;
  has_teeka?: boolean;
  has_pasa?: boolean;
};

/**
 * Update clothing row inside an existing transaction (no broadcast / blob cleanup).
 * Upload photo BEFORE calling this and pass `photoPath`.
 */
export async function updateInventoryItemInTx(
  tx: Prisma.TransactionClient,
  id: number,
  form: UpdateInventoryForm,
  photoFilename: string | null,
  thumbnailFilename: string | null = null,
): Promise<{
  updated: Awaited<ReturnType<typeof prisma.clothingItem.update>>;
  uploadsToDelete: string[];
  beforeSnapshot: Record<string, unknown>;
  photoReplaced: boolean;
  photoRemoved: boolean;
}> {
  const existing = await tx.clothingItem.findUnique({ where: { id } });
  if (!existing) throw new Error("Item not found");
  const beforeSnapshot = snapshotInventory(existing as unknown as Record<string, unknown>);

  let photo = existing.photo;
  let thumbnailPhoto = existing.thumbnailPhoto;
  let newOriginalPhoto: string | null | undefined = undefined;
  const uploadsToDelete: string[] = [];
  const photoRemoved = !!form.remove_photo;
  const photoReplaced = Boolean(photoFilename && !photoRemoved);

  if (photoRemoved) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    if (existing.thumbnailPhoto) uploadsToDelete.push(existing.thumbnailPhoto);
    if (existing.originalPhoto) uploadsToDelete.push(existing.originalPhoto);
    if (existing.enhancedPhoto) uploadsToDelete.push(existing.enhancedPhoto);
    if (existing.marketingPhoto) uploadsToDelete.push(existing.marketingPhoto);
    if (existing.recognitionImage) uploadsToDelete.push(existing.recognitionImage);
    photo = null;
    thumbnailPhoto = null;
  }
  if (photoReplaced && photoFilename) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    if (existing.thumbnailPhoto) uploadsToDelete.push(existing.thumbnailPhoto);
    if (existing.originalPhoto && existing.originalPhoto !== existing.photo) {
      uploadsToDelete.push(existing.originalPhoto);
    }
    if (existing.enhancedPhoto) uploadsToDelete.push(existing.enhancedPhoto);
    if (existing.marketingPhoto) uploadsToDelete.push(existing.marketingPhoto);
    photo = photoFilename;
    thumbnailPhoto = thumbnailFilename;
    newOriginalPhoto = photoFilename;
  }

  const updated = await tx.clothingItem.update({
    where: { id },
    data: {
      name: form.name.trim(),
      category: form.category,
      size: form.size || "",
      color: form.color || "",
      dailyRate: form.daily_rate ?? existing.dailyRate,
      deposit: form.deposit ?? existing.deposit,
      conditionNotes: form.condition_notes || "",
      status: form.status || existing.status,
      subCategory: form.sub_category || existing.subCategory,
      photo,
      thumbnailPhoto,
      ...(newOriginalPhoto !== undefined ? { originalPhoto: newOriginalPhoto } : {}),
      ...(photoReplaced
        ? {
            enhancedPhoto: null,
            enhancementStatus: "none",
            enhancementError: null,
            recognitionImage: null,
            recognitionFingerprint: Prisma.JsonNull,
            identificationIndex: Prisma.JsonNull,
            identificationIndexedAt: null,
            siglipEmbedding: Prisma.JsonNull,
            siglipIndexedAt: null,
          }
        : {}),
      itemType: itemTypeForCategory(form.category),
      hasNecklace: form.has_necklace ?? existing.hasNecklace,
      hasEarrings: form.has_earrings ?? existing.hasEarrings,
      hasTeeka: form.has_teeka ?? existing.hasTeeka,
      hasPasa: form.has_pasa ?? existing.hasPasa,
      ...(photoRemoved
        ? {
            originalPhoto: null,
            enhancedPhoto: null,
            marketingPhoto: null,
            enhancementStatus: "none",
            enhancementError: null,
            aiFingerprint: null,
            aiIndexedAt: null,
            identificationIndex: Prisma.JsonNull,
            identificationIndexedAt: null,
            siglipEmbedding: Prisma.JsonNull,
            siglipIndexedAt: null,
            recognitionImage: null,
            recognitionFingerprint: Prisma.JsonNull,
          }
        : {}),
    },
  });

  const safeUploadsToDelete = await unreferencedInventoryPhotoPaths(
    tx,
    uploadsToDelete,
    id,
  );
  return {
    updated,
    uploadsToDelete: safeUploadsToDelete,
    beforeSnapshot,
    photoReplaced,
    photoRemoved,
  };
}

export async function updateInventoryItem(id: number, form: UpdateInventoryForm, by?: string) {
  let photoFilename: string | null = form.photoPath ?? null;
  let thumbnailFilename: string | null = null;
  if (!photoFilename && form.photo && !form.remove_photo) {
    const saved = await saveFastInventoryPhotoWithThumb(form.photo);
    photoFilename = saved.photo;
    thumbnailFilename = saved.thumbnailPhoto;
  }

  let result: Awaited<ReturnType<typeof updateInventoryItemInTx>>;
  try {
    result = await prisma.$transaction((tx) =>
      updateInventoryItemInTx(tx, id, form, photoFilename, thumbnailFilename),
    );
  } catch (e) {
    if (photoFilename && form.photo && !form.photoPath) {
      await enqueueBlobCleanup(
        [photoFilename, thumbnailFilename],
        { reason: "orphan_inventory_update_upload" },
      );
    }
    throw e;
  }

  const { updated, uploadsToDelete, beforeSnapshot, photoReplaced, photoRemoved } = result;
  if (uploadsToDelete.length) {
    await enqueueBlobCleanup(uploadsToDelete, { reason: "inventory_photo_replaced" });
  }
  broadcastShopEvent({ type: "inventory.changed", itemIds: [id], by });
  void logActivity({
    username: by || "system",
    action: "updated",
    entity: "inventory",
    entityId: id,
    label: `Updated ${updated.name} (${updated.category})`,
    before: beforeSnapshot,
    after: snapshotInventory(updated as unknown as Record<string, unknown>),
  });
  if (photoRemoved) {
    void cleanupRemovedInventoryPhoto(id);
  } else if (updated.photo && photoReplaced) {
    try {
      await enqueueInventoryPhotoJobsDurable([updated.id], "photo_replaced");
    } catch (e) {
      console.error("[inventory] durable AI enqueue failed after photo replace (item kept):", e);
    }
  }
  return updated;
}

export async function deleteInventoryItem(id: number, by?: string) {
  const activeBooking = await prisma.booking.findFirst({
    where: {
      status: { in: ["booked", "delivered"] },
      OR: [{ itemId: id }, { bookingItems: { some: { itemId: id } } }],
    },
    select: { id: true, customerName: true, publicBookingId: true },
  });
  if (activeBooking) {
    throw new Error(
      `Cannot delete — item is in active booking ${activeBooking.publicBookingId || `#${activeBooking.id}`} (${activeBooking.customerName}).`,
    );
  }

  const existing = await prisma.clothingItem.findUnique({ where: { id } });
  if (!existing) return;

  const uploadPaths = [
    existing.photo,
    existing.thumbnailPhoto,
    existing.originalPhoto,
    existing.enhancedPhoto,
    existing.marketingPhoto,
    existing.recognitionImage,
  ].filter((p): p is string => !!p);

  await prisma.clothingItem.delete({ where: { id } });

  const safeUploadPaths = await unreferencedInventoryPhotoPaths(prisma, uploadPaths);
  await enqueueBlobCleanup(safeUploadPaths, { reason: "inventory_deleted" });
  broadcastShopEvent({ type: "inventory.changed", itemIds: [id], by });
  logActivity({
    username: by || "system",
    action: "deleted",
    entity: "inventory",
    entityId: id,
    label: `Deleted ${existing.name} (${existing.category})`,
    before: snapshotInventory(existing as unknown as Record<string, unknown>),
  });
}

