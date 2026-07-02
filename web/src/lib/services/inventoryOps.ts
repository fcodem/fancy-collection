import prisma from "../prisma";
import {
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
  JEWELLERY_CATEGORIES,
  ACCESSORY_CATEGORIES,
} from "../constants";
import { dressDisplayName, formatUnitName } from "../dress";
import { computeAverageHash, hashSimilarity } from "../photoHash";
import { deleteUpload, saveUpload } from "../upload";
import { broadcastShopEvent } from "../realtime/broadcast";
import { logActivity, snapshotInventory } from "../activityLog";

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
  },
  by?: string,
) {
  const photoFilename = form.photo ? await saveUpload(form.photo) : "";
  const itemType = itemTypeForCategory(form.category);
  const subCategory = form.sub_category || "Normal";
  const quantity = Math.max(1, Math.min(Number(form.quantity) || 1, 50));

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
        },
        quantity
      );
      created.push(...units);
    }
    broadcastShopEvent({ type: "inventory.changed", itemIds: created.map((i) => i.id), by });
    for (const item of created) {
      logActivity({
        username: by || "system",
        action: "created",
        entity: "inventory",
        entityId: item.id,
        label: `Added ${item.name} (${item.category}, ${item.size || "—"})`,
        after: snapshotInventory(item as unknown as Record<string, unknown>),
      });
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
    },
    quantity
  );
  broadcastShopEvent({ type: "inventory.changed", itemIds: units.map((i) => i.id), by });
  for (const item of units) {
    logActivity({
      username: by || "system",
      action: "created",
      entity: "inventory",
      entityId: item.id,
      label: `Added ${item.name} (${item.category}, ${item.size || "—"})`,
      after: snapshotInventory(item as unknown as Record<string, unknown>),
    });
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
  },
  by?: string,
) {
  const existing = await prisma.clothingItem.findUnique({ where: { id } });
  if (!existing) throw new Error("Item not found");
  const beforeSnapshot = snapshotInventory(existing as unknown as Record<string, unknown>);

  let photo = existing.photo;
  if (form.remove_photo) {
    if (existing.photo) await deleteUpload(existing.photo);
    photo = null;
  }
  if (form.photo) {
    if (existing.photo) await deleteUpload(existing.photo);
    photo = await saveUpload(form.photo);
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
      itemType: itemTypeForCategory(form.category),
    },
  });
  broadcastShopEvent({ type: "inventory.changed", itemIds: [id], by });
  logActivity({
    username: by || "system",
    action: "updated",
    entity: "inventory",
    entityId: id,
    label: `Updated ${updated.name} (${updated.category})`,
    before: beforeSnapshot,
    after: snapshotInventory(updated as unknown as Record<string, unknown>),
  });
  return updated;
}

export async function deleteInventoryItem(id: number, by?: string) {
  const activeBooking = await prisma.booking.findFirst({
    where: {
      status: { in: ["booked", "delivered"] },
      OR: [{ itemId: id }, { bookingItems: { some: { itemId: id } } }],
    },
  });
  if (activeBooking) throw new Error("Cannot delete — item is in an active booking.");
  const existing = await prisma.clothingItem.findUnique({ where: { id } });
  await prisma.clothingItem.delete({ where: { id } });
  broadcastShopEvent({ type: "inventory.changed", itemIds: [id], by });
  if (existing) {
    logActivity({
      username: by || "system",
      action: "deleted",
      entity: "inventory",
      entityId: id,
      label: `Deleted ${existing.name} (${existing.category})`,
      before: snapshotInventory(existing as unknown as Record<string, unknown>),
    });
  }
}

export async function photoSearchInventory(photoBuffer: Buffer, category = "") {
  const queryHash = await computeAverageHash(photoBuffer);
  const allItems = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });

  const scored: Array<{ similarity: number; item: (typeof allItems)[0] }> = [];
  for (const item of allItems) {
    if (!item.photo) continue;
    try {
      let storedBuffer: Buffer;
      if (item.photo.startsWith("http://") || item.photo.startsWith("https://")) {
        const res = await fetch(item.photo);
        if (!res.ok) continue;
        storedBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        const { readFile } = await import("fs/promises");
        const { join } = await import("path");
        const photoPath = join(process.cwd(), "public", "uploads", item.photo);
        storedBuffer = await readFile(photoPath);
      }
      const storedHash = await computeAverageHash(storedBuffer);
      const similarity = hashSimilarity(queryHash, storedHash);
      if (similarity >= 40) scored.push({ similarity, item });
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
    photo: item.photo || "",
    similarity: sim,
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
      other_results = scored.filter((s) => s.item.category !== category).slice(0, 10).map((s) => toDict(s.similarity, s.item));
    }
  } else {
    category_results = scored.slice(0, 10).map((s) => toDict(s.similarity, s.item));
  }

  return {
    ok: true,
    category,
    category_results,
    other_results,
    used_fallback,
    results: [...category_results, ...other_results],
  };
}
