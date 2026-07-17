import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import {
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
  JEWELLERY_CATEGORIES,
  ACCESSORY_CATEGORIES,
} from "../constants";
import { dressDisplayName, formatUnitName } from "../dress";
import { saveFastInventoryPhoto } from "../upload";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotInventory } from "../activityLog";
import { onInventoryPhotoRemoved } from "../dressCheckerIndexing";
import { enqueueInventoryPhotoJobsDurable } from "../inventoryPhotoPipeline";
import { enqueueBlobCleanup } from "../blobCleanup";
import { generateUuidV4 } from "../clientUuid";
import { mapConfidence } from "../siglipMath";

export type InventoryPhotoSearchFilters = {
  category?: string;
  subCategory?: string;
  mode?: "AUTO" | "MANUAL" | "ALL";
  size?: string;
  color?: string;
  gender?: string;
  status?: string;
  designer?: string;
  minPrice?: number;
  maxPrice?: number;
};

function itemTypeForCategory(category: string) {
  if (JEWELLERY_CATEGORIES.includes(category)) return "jewellery";
  if (ACCESSORY_CATEGORIES.includes(category)) return "accessory";
  return "clothing";
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Atomically reserve `count` SKU numbers and return formatted ITM-#### values. */
export async function allocateInventorySkus(
  count: number,
  client: DbClient = prisma,
): Promise<string[]> {
  const n = Math.max(1, Math.min(Math.floor(count), 500));
  const rows = await client.$queryRaw<Array<{ start_value: bigint }>>`
    UPDATE inventory_sku_counter
    SET next_value = next_value + ${n}
    WHERE id = 1
    RETURNING (next_value - ${n}) AS start_value
  `;
  const start = Number(rows[0]?.start_value ?? 1);
  return Array.from({ length: n }, (_, i) => `ITM-${String(start + i).padStart(4, "0")}`);
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
  await tx.clothingItem.createMany({ data: rows });
  return tx.clothingItem.findMany({
    where: { sku: { in: skus } },
    orderBy: { sku: "asc" },
  });
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
    const created = [];
    for (const sz of sizes) {
      const units = await createInventoryUnitsInTx(
        tx,
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
          inventoryGroupId,
          ...partFlags,
        },
        quantity,
      );
      created.push(...units);
    }
    return { items: created, inventoryGroupId };
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
  if (!photoFilename && form.photo) {
    photoFilename = await saveFastInventoryPhoto(form.photo);
  }

  let created: Awaited<ReturnType<typeof createInventoryUnitsInTx>> = [];
  try {
    created = await prisma.$transaction(async (tx) => {
      const { items } = await createInventoryItemInTx(tx, form, photoFilename);
      return items;
    });
  } catch (e) {
    if (photoFilename) {
      await enqueueBlobCleanup([photoFilename], { reason: "orphan_inventory_create_upload" });
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
  let newOriginalPhoto: string | null | undefined = undefined;
  const uploadsToDelete: string[] = [];
  const photoRemoved = !!form.remove_photo;
  const photoReplaced = Boolean(photoFilename && !photoRemoved);

  if (photoRemoved) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    photo = null;
  }
  if (photoReplaced && photoFilename) {
    if (existing.photo) uploadsToDelete.push(existing.photo);
    if (existing.originalPhoto && existing.originalPhoto !== existing.photo) {
      uploadsToDelete.push(existing.originalPhoto);
    }
    if (existing.enhancedPhoto) uploadsToDelete.push(existing.enhancedPhoto);
    if (existing.marketingPhoto) uploadsToDelete.push(existing.marketingPhoto);
    photo = photoFilename;
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

  return { updated, uploadsToDelete, beforeSnapshot, photoReplaced, photoRemoved };
}

export async function updateInventoryItem(id: number, form: UpdateInventoryForm, by?: string) {
  let photoFilename: string | null = form.photoPath ?? null;
  if (!photoFilename && form.photo && !form.remove_photo) {
    photoFilename = await saveFastInventoryPhoto(form.photo);
  }

  let result: Awaited<ReturnType<typeof updateInventoryItemInTx>>;
  try {
    result = await prisma.$transaction((tx) =>
      updateInventoryItemInTx(tx, id, form, photoFilename),
    );
  } catch (e) {
    if (photoFilename && form.photo && !form.photoPath) {
      await enqueueBlobCleanup([photoFilename], { reason: "orphan_inventory_update_upload" });
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
    onInventoryPhotoRemoved(id);
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

  const uploadPaths = [existing.photo, existing.recognitionImage].filter(
    (p): p is string => !!p,
  );

  await prisma.clothingItem.delete({ where: { id } });

  await enqueueBlobCleanup(uploadPaths, { reason: "inventory_deleted" });
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

export type PhotoSearchResult = {
  ok: true;
  category: string;
  category_results: Array<Record<string, unknown>>;
  other_results: Array<Record<string, unknown>>;
  used_fallback: boolean;
  fallback_reason?: string | null;
  fallback_code?: string | null;
  search_degraded?: boolean;
  degradation?: import("../dressChecker/searchHealth").SearchDegradation | null;
  results: Array<Record<string, unknown>>;
  search_engine: string;
  best_similarity: number;
  reliable_identification: boolean;
  identification_meta?: Record<string, unknown>;
  image_warnings?: string[];
  detectedStyle?: string;
  detectedColor?: string;
  detectedPattern?: string;
  detectedEmbroidery?: string;
  screenshot_warning?: boolean;
  similar_available?: Array<Record<string, unknown>>;
  ai_diagnostics?: Record<string, unknown>;
};

export async function photoSearchInventory(
  photoBuffer: Buffer,
  filters: InventoryPhotoSearchFilters = {},
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

  console.log("[DressSearch] VECTOR SEARCH path=pgvector");
  try {
    const { searchInventoryByDressCheckerEnterprise, VectorSearchFailure } = await import(
      "../dressChecker/enterpriseSearch"
    );
    const enterprise = await searchInventoryByDressCheckerEnterprise(
      safeBuffer,
      {
        category: filters.category || "",
        subCategory: filters.subCategory || "",
        mode: filters.mode || "MANUAL",
      },
      { debug: options.debug },
    );
    console.log(
      `[DressSearch] VECTOR SEARCH OK engine=pgvector results=${enterprise.results.length} ms=${enterprise.processing_time_ms}`,
    );
    return {
      ...(enterprise as unknown as PhotoSearchResult),
      similar_available: enterprise.similar_available,
      ai_diagnostics: enterprise.ai_diagnostics,
      screenshot_warning: screenshotWarning,
      image_warnings: imageWarnings,
      used_fallback: false,
      fallback_reason: null,
      fallback_code: null,
      search_degraded: false,
      degradation: null,
    };
  } catch (enterpriseErr) {
    const { VectorSearchFailure } = await import("../dressChecker/enterpriseSearch");
    const { buildSearchDegradation, logSearchDegradation } = await import(
      "../dressChecker/searchHealth"
    );

    const exactReason =
      enterpriseErr instanceof VectorSearchFailure
        ? enterpriseErr.reason
        : enterpriseErr instanceof Error
          ? `Unexpected search error: ${enterpriseErr.message}`
          : "Unexpected search error";

    const failureCode =
      enterpriseErr instanceof VectorSearchFailure
        ? enterpriseErr.code
        : "UNEXPECTED_SEARCH_ERROR";

    // Hash fallback ONLY for true infrastructure / pgvector unavailability — never for app coding errors.
    const infraCodes = new Set([
      "PGVECTOR_MISSING",
      "EMBEDDINGS_MISSING",
      "EMBEDDINGS_MISSING_ALL",
      "VECTOR_COLUMN_MISSING",
      "DATABASE_UNAVAILABLE",
    ]);
    if (!infraCodes.has(String(failureCode))) {
      console.error(
        `[DressSearch] Refusing hash fallback for application/search error code=${failureCode}`,
      );
      throw enterpriseErr;
    }

    const vectorDiagnostics =
      enterpriseErr instanceof VectorSearchFailure ? enterpriseErr.diagnostics : {};

    const degradation = buildSearchDegradation(
      exactReason,
      { ...vectorDiagnostics, failure_code: failureCode },
      filters.category || undefined,
    );
    degradation.code = failureCode;

    logSearchDegradation(degradation);

    const hashResult = await photoSearchInventoryHash(
      safeBuffer,
      filters.category || "",
      degradation,
    );
    return {
      ...hashResult,
      screenshot_warning: screenshotWarning,
      image_warnings: imageWarnings,
    };
  }
}

async function photoSearchInventoryHash(
  photoBuffer: Buffer,
  category = "",
  degradation?: import("../dressChecker/searchHealth").SearchDegradation,
) {
  console.log("[DressSearch] HASH FALLBACK ACTIVE — degraded search, not primary engine");
  if (degradation) {
    console.log(`[DressSearch] HASH FALLBACK cause code=${degradation.code}`);
    console.log(`[DressSearch] HASH FALLBACK cause reason=${degradation.reason}`);
  }
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
  const fallbackReason = degradation
    ? `Hash fallback after pgvector failed [${degradation.code}]: ${degradation.reason}`
    : "Hash fallback — pgvector search was not attempted";
  console.log(`[DressSearch] HASH FALLBACK COMPLETE results=${results.length} code=${degradation?.code ?? "unknown"}`);
  return {
    ok: true as const,
    category,
    category_results,
    other_results,
    used_fallback: true,
    search_degraded: true,
    degradation: degradation ?? null,
    fallback_reason: fallbackReason,
    fallback_code: degradation?.code ?? "SEARCH_DEGRADED_HASH",
    results,
    search_engine: "hash" as const,
    best_similarity: results[0]?.similarity ?? 0,
    // Hash results must never auto-identify a dress
    reliable_identification: false,
    ai_diagnostics: degradation
      ? {
          search_degradation: degradation,
          warning:
            "Hash results are approximate — fix pgvector/infrastructure. Do not auto-identify.",
        }
      : undefined,
  };
}
