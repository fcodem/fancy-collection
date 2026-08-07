import { BASE_MENS } from "@/lib/constants";
import { dressDisplayName, stripUnitSuffix } from "@/lib/dress";

const MENS_SET = new Set(BASE_MENS.map((c) => c.toLowerCase()));

export function isMensAvailabilityCategory(category: string | null | undefined): boolean {
  return MENS_SET.has(String(category || "").trim().toLowerCase());
}

/** One booking row per product + size (not one row per physical unit). */
export function mensSizeAvailabilityKey(item: {
  name: string;
  category: string;
  size?: string | null;
}): string {
  return [
    stripUnitSuffix(item.name).toLowerCase(),
    String(item.category || "").trim().toLowerCase(),
    String(item.size || "").trim().toLowerCase(),
  ].join("|");
}

type CollapseableFreeItem = {
  id: number;
  name: string;
  display_name?: string;
  category: string;
  size?: string | null;
  free_quantity?: number;
  total_quantity?: number;
};

/**
 * Collapse men's free units into one selectable row per size.
 * Keeps the first free unit id for booking; free_quantity = distinct units of that size.
 */
export function collapseMensAvailabilityItems<T extends CollapseableFreeItem>(items: T[]): T[] {
  const out: T[] = [];
  const mensByKey = new Map<string, { row: T; ids: Set<number>; total: number }>();

  for (const item of items) {
    if (!isMensAvailabilityCategory(item.category)) {
      out.push(item);
      continue;
    }
    const key = mensSizeAvailabilityKey(item);
    const baseName = stripUnitSuffix(item.name);
    const existing = mensByKey.get(key);
    if (!existing) {
      const row = {
        ...item,
        name: baseName,
        display_name: dressDisplayName(baseName, item.category, item.size),
        free_quantity: 1,
      };
      mensByKey.set(key, {
        row,
        ids: new Set([item.id]),
        total: Math.max(item.total_quantity || 0, 1),
      });
      out.push(row);
      continue;
    }
    existing.ids.add(item.id);
    existing.row.free_quantity = existing.ids.size;
    existing.total = Math.max(existing.total, item.total_quantity || 0, existing.ids.size);
    existing.row.total_quantity = existing.total;
  }

  return out;
}

/** Stable append without duplicate unit ids (load-more races). */
export function mergeAvailabilityItemsById<T extends { id: number }>(
  previous: T[],
  incoming: T[],
): T[] {
  if (!incoming.length) return previous;
  const seen = new Set(previous.map((i) => i.id));
  const merged = [...previous];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
