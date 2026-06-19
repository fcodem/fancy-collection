import prisma from "../prisma";
import {
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
  JEWELLERY_CATEGORIES,
  ACCESSORY_CATEGORIES,
} from "../constants";
import { formatUnitName } from "../dress";
import { computeAverageHash, hashSimilarity } from "../photoHash";
import { saveUpload } from "../upload";

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
  for (let unit = 1; unit <= count; unit++) {
    const item = await prisma.clothingItem.create({
      data: {
        name: formatUnitName(baseName, unit),
        sku: await generateItemSku(),
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

export async function createInventoryItem(form: {
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
}) {
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
    return created;
  }

  return createInventoryUnits(
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
  }
) {
  const existing = await prisma.clothingItem.findUnique({ where: { id } });
  if (!existing) throw new Error("Item not found");

  let photo = existing.photo;
  if (form.remove_photo) photo = null;
  if (form.photo) photo = await saveUpload(form.photo);

  return prisma.clothingItem.update({
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
}

export async function deleteInventoryItem(id: number) {
  const activeBooking = await prisma.booking.findFirst({
    where: {
      status: { in: ["booked", "delivered"] },
      OR: [{ itemId: id }, { bookingItems: { some: { itemId: id } } }],
    },
  });
  if (activeBooking) throw new Error("Cannot delete — item is in an active booking.");
  await prisma.clothingItem.delete({ where: { id } });
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
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const photoPath = join(process.cwd(), "public", "uploads", item.photo);
      const storedBuffer = await readFile(photoPath);
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
