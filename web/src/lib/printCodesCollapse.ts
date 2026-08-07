import { stripUnitSuffix } from "@/lib/dress";
import { MENS_CATEGORIES } from "@/lib/constants";

export type PrintItemRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  size: string | null;
  color: string | null;
  inventoryGroupId: string | null;
  scanCodes: Array<{
    id: number;
    code: string;
    format: string;
    isPrimary: boolean;
  }>;
};

function normalizeSize(size: string | null | undefined): string {
  return String(size || "").trim().toLowerCase();
}

function isMensCategory(category: string | null | undefined): boolean {
  return MENS_CATEGORIES.includes(String(category || "").trim());
}

/**
 * Collapse key for print rows.
 * Men's: always dress name + category + size (never merge different sizes;
 * multi-unit same size still shares one QR row).
 * Other: inventory group + size, or single item id.
 */
export function printCollapseKey(item: PrintItemRow): string {
  const size = normalizeSize(item.size);
  if (isMensCategory(item.category)) {
    const base = stripUnitSuffix(item.name).toLowerCase();
    const cat = String(item.category || "")
      .trim()
      .toLowerCase();
    return `n:${base}|c:${cat}|s:${size}`;
  }
  if (item.inventoryGroupId) {
    return `g:${item.inventoryGroupId}|s:${size}`;
  }
  return `id:${item.id}`;
}

/**
 * One printable row per inventory group **and size**.
 * Shared QR still covers duplicate units of the same size; sizes 38/40/42 each get their own row/QR.
 */
export function collapsePrintItemsByGroup(items: PrintItemRow[]) {
  const byKey = new Map<string, PrintItemRow[]>();
  for (const item of items) {
    const key = printCollapseKey(item);
    const list = byKey.get(key) || [];
    list.push(item);
    byKey.set(key, list);
  }

  const seen = new Set<string>();
  const collapsed: Array<PrintItemRow & { unitCount: number; displayName: string }> = [];

  for (const item of items) {
    const key = printCollapseKey(item);
    if (seen.has(key)) continue;
    seen.add(key);

    const members = byKey.get(key) || [item];
    const withQr =
      members.find((m) => m.scanCodes.some((c) => c.format === "QR_CODE")) ||
      members.reduce((a, b) => (a.id <= b.id ? a : b));
    const displayName = stripUnitSuffix(withQr.name);
    collapsed.push({
      ...withQr,
      name: displayName,
      size: withQr.size,
      unitCount: members.length,
      displayName,
    });
  }

  return collapsed;
}

/** Group collapsed print rows into men's products → sizes for the product picker UI. */
export function groupMensPrintProducts(
  items: Array<{
    id: number;
    sku: string;
    name: string;
    category: string;
    size: string | null;
    color: string | null;
    inventoryGroupId?: string | null;
    scanCodes: PrintItemRow["scanCodes"];
    unitCount?: number;
    displayName?: string;
  }>,
) {
  type MensPrintItem = {
    id: number;
    sku: string;
    name: string;
    category: string;
    size: string | null;
    color: string | null;
    inventoryGroupId?: string | null;
    scanCodes: PrintItemRow["scanCodes"];
    unitCount?: number;
    displayName?: string;
  };
  type SizeRow = {
    size: string;
    item: MensPrintItem;
  };
  const byProduct = new Map<
    string,
    {
      key: string;
      name: string;
      category: string;
      sizes: Map<string, SizeRow>;
    }
  >();

  for (const item of items) {
    if (!isMensCategory(item.category)) continue;
    const name = stripUnitSuffix(item.displayName || item.name);
    const category = item.category;
    const productKey = `${name.toLowerCase()}|${category.toLowerCase()}`;
    let product = byProduct.get(productKey);
    if (!product) {
      product = { key: productKey, name, category, sizes: new Map() };
      byProduct.set(productKey, product);
    }
    const sizeLabel = String(item.size || "").trim() || "—";
    const sizeKey = normalizeSize(sizeLabel);
    const existing = product.sizes.get(sizeKey);
    if (!existing) {
      product.sizes.set(sizeKey, { size: sizeLabel, item });
    } else {
      // Prefer the row that already has a QR; accumulate unit counts.
      const preferQr =
        item.scanCodes.some((c) => c.format === "QR_CODE") &&
        !existing.item.scanCodes.some((c) => c.format === "QR_CODE");
      const mergedItem = preferQr ? item : existing.item;
      product.sizes.set(sizeKey, {
        size: existing.size,
        item: {
          ...mergedItem,
          unitCount: (existing.item.unitCount || 1) + (item.unitCount || 1),
        },
      });
    }
  }

  return Array.from(byProduct.values())
    .map((p) => ({
      key: p.key,
      name: p.name,
      category: p.category,
      sizes: Array.from(p.sizes.values()).sort((a, b) =>
        a.size.localeCompare(b.size, undefined, { numeric: true }),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
