import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import {
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
  JEWELLERY_CATEGORIES,
  ACCESSORY_CATEGORIES,
} from "../constants";
import { dressDisplayName, formatUnitName } from "../dress";
import { deleteUploads, saveFastInventoryPhoto } from "../upload";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotInventory } from "../activityLog";
import { onInventoryPhotoRemoved } from "../dressCheckerIndexing";
import { scheduleInventoryPhotoPipeline } from "../inventoryPhotoPipeline";
import {
  siglipPhotoSearch,
  type SiglipSearchFilters,
  type SiglipSearchResponse,
} from "./siglipSearch";
import { mapConfidence } from "../siglipMath";

function itemTypeForCategory(category: string) {
  if (JEWELLERY_CATEGORIES.includes(category)) return "jewellery";
  if (ACCESSORY_CATEGORIES.includes(category)) return "accessory";
  return "clothing";
}

export async function generateItemSku() {
  const last = await prisma.clothingItem.findFirst({ orderBy: { id: "desc" } });
  const next = (last?.id || 0) + 1;
  return `ITM-${String(next).padStart(4, "0")}`;
}

async function createInventoryUnits(
  base: {
    name: string;
    category: string;
    size: string;
    color: string;
    daily_rate?: number;
    deposit?: number;
    condition_notes?: string;
    itemType: string;
    photo: string;
    subCategory: string;
    hasNecklace?: boolean;
    hasEarrings?: boolean;
    hasTeeka?: boolean;
    hasPasa?: boolean;
  },
  quantity: number
) {
  const created = [];
  const baseName = base.name.trim();
  const count = Math.max(1, Math.min(quantity, 50));
  const last = await prisma.clothingItem.findFirst({ orderBy: { id: "desc" } });
  let nextSkuNum = (last?.id || 0) + 1;
  for (let unit = 1; unit <= count; unit++) {
    const sku = `ITM-${String(nextSkuNum).padStart(4, "0")}`;
    nextSkuNum += 1;
    const item = await prisma.clothingItem.create({
      data: {
        name: formatUnitName(baseName, unit),
        sku,
        category: base.category,
        size: base.size,
        color: base.color,
        dailyRate: base.daily_rate || 0,
        deposit: base.deposit || 0,
        conditionNotes: base.condition_notes || "",
        itemType: base.itemType,
        photo: base.photo,
        subCategory: base.subCategory,
        hasNecklace: base.hasNecklace ?? false,
        hasEarrings: base.hasEarrings ?? false,
        hasTeeka: base.hasTeeka ?? false,
        hasPasa: base.hasPasa ?? false,
      },
    });
    created.push(item);
  }
  return created;
}

export async function createInventoryItem(
  form: {
    name: string;
    category: string;
    sizes?: string[];
    size?: string;
    color?: string;
    daily_rate?: number;
    deposit?: number;
    condition_notes?: string;
    sub_category?: string;
    photo?: File | null;
    quantity?: number;
    has_necklace?: boolean;
    has_earrings?: boolean;
    has_teeka?: boolean;
    has_pasa?: boolean;
  },
  by?: string,
) {
  let photoFilename = "";
  if (form.photo) {
    photoFilename = await saveFastInventoryPhoto(form.photo);
  }
  const itemType = itemTypeForCategory(form.category);
  const subCategory = form.sub_category || "Normal";
  const quantity = Math.max(1, Math.min(Number(form.quantity) || 1, 50));
  const partFlags = {
    hasNecklace: !!form.has_necklace,
    hasEarrings: !!form.has_earrings,
    hasTeeka: !!form.has_teeka,
    hasPasa: !!form.has_pasa,
  };

  if (MENS_CATEGORIES.includes(form.category)) {
    const sizes = form.sizes || [];
    if (!sizes.length) throw new Error("Please select at least one size for men's clothing.");
    const created = [];
    for (const sz of sizes) {
      const units = await createInventoryUnits(
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
          subCategory,
          ...partFlags,
        },
        quantity
      );
      created.push(...units);
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
      if (photoFilename) {
        scheduleInventoryPhotoPipeline(item.id, item.category, "photo_created");
      }
    }
    return created;
  }

  const units = await createInventoryUnits(
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
      subCategory,
      ...partFlags,
    },
    quantity
  );
  broadcastShopEvent({ type: "inventory.changed", itemIds: units.map((i) => i.id), by });
  for (const item of units) {
    void logActivity({
      username: by || "system",
      action: "created",
      entity: "inventory",
      entityId: item.id,
      label: `Added ${item.name} (${item.category}, ${item.size || "—"})`,
      after: snapshotInventory(item as unknown as Record<string, unknown>),
    });
    if (photoFilename) {
      scheduleInventoryPhotoPipeline(item.id, item.category, "photo_created");
    }
  }
  return units;
}

export async function updateInventoryItem(
  id: number,
  form: {
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
    remove_photo?: boolean;
    has_necklace?: boolean;
    has_earrings?: boolean;
    has_teeka?: boolean;
    has_pasa?: boolean;
  },
  by?: string,
) {
  const existing = await prisma.clothingItem.findUnique({ where: { id } });
  if (!existing) throw new Error("Item not found");
  const beforeSnapshot = snapshotInventory(existing as unknown as Record<string, unknown>);

  let photo = existing.photo;
  const uploadsToDelete: string[] = [];
  if (form.remove_photo) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    photo = null;
  }
  if (form.photo) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    photo = await saveFastInventoryPhoto(form.photo);
  }

  const updated = await prisma.clothingItem.update({
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
      ...(form.photo
        ? {
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
      ...(form.remove_photo
        ? {
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
  if (uploadsToDelete.length) {
    void deleteUploads(uploadsToDelete);
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
  if (form.remove_photo) {
    onInventoryPhotoRemoved(id);
  } else if (updated.photo && form.photo) {
    scheduleInventoryPhotoPipeline(updated.id, updated.category, "photo_replaced");
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

  const uploadPaths = [existing.photo, existing.recognitionImage].filter(
    (p): p is string => !!p,
  );

  await prisma.clothingItem.delete({ where: { id } });

  void deleteUploads(uploadPaths);
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

export type PhotoSearchResult = SiglipSearchResponse & {
  detectedStyle?: string;
  detectedColor?: string;
  detectedPattern?: string;
  detectedEmbroidery?: string;
  screenshot_warning?: boolean;
};

export async function photoSearchInventory(
  photoBuffer: Buffer,
  filters: SiglipSearchFilters = {},
  options: { debug?: boolean; mime?: string } = {},
): Promise<PhotoSearchResult> {
  const { validateDressCheckerImage } = await import("../dressCheckerValidation");
  const validation = await validateDressCheckerImage(photoBuffer, options.mime);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  const imageWarnings = validation.warnings;

  const { normalizeImageBuffer, isLikelyScreenshot } = await import("../photoHash");
  let safeBuffer: Buffer;
  let screenshotWarning = false;
  try {
    safeBuffer = await normalizeImageBuffer(photoBuffer);
    screenshotWarning = await isLikelyScreenshot(safeBuffer);
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message.includes("dimensions")
        ? "Could not read this image. Please upload a JPG or PNG photo."
        : "Could not process this image. Try a different photo or format (JPG/PNG/WEBP).",
    );
  }

  try {
    const result = await siglipPhotoSearch(safeBuffer, filters, options);
    return { ...result, screenshot_warning: screenshotWarning, image_warnings: imageWarnings };
  } catch (siglipErr) {
    console.warn("[DressSearch] SigLIP search failed, using hash fallback:", siglipErr);
  }

  try {
    const hashResult = await photoSearchInventoryHash(safeBuffer, filters.category || "");
    return { ...hashResult, screenshot_warning: screenshotWarning, image_warnings: imageWarnings };
  } catch (hashErr) {
    console.error("[DressSearch] Hash search failed:", hashErr);
    return {
      ok: true as const,
      category: filters.category || "",
      category_results: [],
      other_results: [],
      used_fallback: false,
      results: [],
      search_engine: "hash",
      best_similarity: 0,
      reliable_identification: false,
      screenshot_warning: screenshotWarning,
      image_warnings: imageWarnings,
    };
  }
}

async function photoSearchInventoryHash(photoBuffer: Buffer, category = "") {
  const { computeImageFingerprint, combinedImageSimilarity, PHOTO_MATCH_MIN_SCORE } = await import("../photoHash");
  const { loadPhotoBuffer } = await import("./siglipSearch");

  const queryFp = await computeImageFingerprint(photoBuffer);
  const allItems = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      status: true,
      size: true,
      color: true,
      photo: true,
      dailyRate: true,
      subCategory: true,
    },
  });

  const scored: Array<{ similarity: number; item: (typeof allItems)[0] }> = [];
  for (const item of allItems) {
    if (!item.photo) continue;
    const storedBuffer = await loadPhotoBuffer(item.photo);
    if (!storedBuffer) continue;
    try {
      const storedFp = await computeImageFingerprint(storedBuffer);
      const similarity = combinedImageSimilarity(queryFp, storedFp);
      if (similarity >= PHOTO_MATCH_MIN_SCORE) scored.push({ similarity, item });
    } catch {
      continue;
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);

  const toDict = (sim: number, item: (typeof allItems)[0]) => ({
    id: item.id,
    name: item.name,
    display_name: dressDisplayName(item.name, item.category, item.size),
    sku: item.sku,
    category: item.category,
    status: item.status,
    size: item.size || "",
    color: item.color || "",
    photo: item.photo || "",
    daily_rate: item.dailyRate,
    sub_category: item.subCategory || "",
    inventory_location: "",
    similarity: sim,
    confidence: mapConfidence(sim),
  });

  let category_results: ReturnType<typeof toDict>[] = [];
  let other_results: ReturnType<typeof toDict>[] = [];
  let used_fallback = false;

  if (category) {
    const catScored = scored.filter((s) => s.item.category === category).slice(0, 10);
    if (catScored.length) {
      category_results = catScored.map((s) => toDict(s.similarity, s.item));
    } else {
      used_fallback = true;
      other_results = scored
        .filter((s) => s.item.category !== category)
        .slice(0, 10)
        .map((s) => toDict(s.similarity, s.item));
    }
  } else {
    category_results = scored.slice(0, 10).map((s) => toDict(s.similarity, s.item));
  }

  const results = [...category_results, ...other_results];
  return {
    ok: true as const,
    category,
    category_results,
    other_results,
    used_fallback,
    results,
    search_engine: "hash" as const,
    best_similarity: results[0]?.similarity ?? 0,
    reliable_identification: (results[0]?.similarity ?? 0) >= 55,
  };
}
