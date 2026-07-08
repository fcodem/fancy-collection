/** Shared jewellery set component helpers (Earrings, Teeka, Pasa). */

export type JewelleryPartKey = "necklace" | "earrings" | "teeka" | "pasa";

export type JewelleryPartFlags = {
  hasNecklace?: boolean;
  hasEarrings?: boolean;
  hasTeeka?: boolean;
  hasPasa?: boolean;
};

export type JewelleryPickFlags = {
  pickNecklace?: boolean;
  pickEarrings?: boolean;
  pickTeeka?: boolean;
  pickPasa?: boolean;
};

export const JEWELLERY_PART_DEFS: Array<{
  key: JewelleryPartKey;
  label: string;
  hasField: keyof JewelleryPartFlags;
  pickField: keyof JewelleryPickFlags;
}> = [
  { key: "necklace", label: "Necklace", hasField: "hasNecklace", pickField: "pickNecklace" },
  { key: "earrings", label: "Earrings", hasField: "hasEarrings", pickField: "pickEarrings" },
  { key: "teeka", label: "Teeka", hasField: "hasTeeka", pickField: "pickTeeka" },
  { key: "pasa", label: "Pasa", hasField: "hasPasa", pickField: "pickPasa" },
];

export function itemHasJewelleryParts(item: JewelleryPartFlags): boolean {
  return !!(item.hasNecklace || item.hasEarrings || item.hasTeeka || item.hasPasa);
}

export function partsPresentOnItem(item: JewelleryPartFlags): JewelleryPartKey[] {
  const out: JewelleryPartKey[] = [];
  if (item.hasNecklace) out.push("necklace");
  if (item.hasEarrings) out.push("earrings");
  if (item.hasTeeka) out.push("teeka");
  if (item.hasPasa) out.push("pasa");
  return out;
}

export function partsPickedOnSelection(sel: JewelleryPickFlags): JewelleryPartKey[] {
  const out: JewelleryPartKey[] = [];
  if (sel.pickNecklace) out.push("necklace");
  if (sel.pickEarrings) out.push("earrings");
  if (sel.pickTeeka) out.push("teeka");
  if (sel.pickPasa) out.push("pasa");
  return out;
}

export function formatJewelleryPartsLabel(parts: JewelleryPartKey[] | JewelleryPickFlags): string {
  const keys = Array.isArray(parts)
    ? parts
    : partsPickedOnSelection(parts);
  if (!keys.length) return "";
  return keys.map((k) => JEWELLERY_PART_DEFS.find((d) => d.key === k)?.label || k).join(", ");
}

export function picksFromKeys(keys: JewelleryPartKey[]): JewelleryPickFlags {
  return {
    pickNecklace: keys.includes("necklace"),
    pickEarrings: keys.includes("earrings"),
    pickTeeka: keys.includes("teeka"),
    pickPasa: keys.includes("pasa"),
  };
}

export function selectionUsesParts(sel: JewelleryPickFlags): boolean {
  return !!(sel.pickNecklace || sel.pickEarrings || sel.pickTeeka || sel.pickPasa);
}

/** Parts booked on an item by overlapping selections (interior overlap). */
export function mergeBookedParts(
  item: JewelleryPartFlags,
  selections: Array<JewelleryPickFlags & { itemId?: number | null }>,
  itemId: number,
): Set<JewelleryPartKey> {
  const busy = new Set<JewelleryPartKey>();
  const hasParts = itemHasJewelleryParts(item);
  for (const sel of selections) {
    if (sel.itemId !== itemId) continue;
    const picked = partsPickedOnSelection(sel);
    if (picked.length) {
      for (const p of picked) busy.add(p);
    } else if (hasParts) {
      for (const p of partsPresentOnItem(item)) busy.add(p);
    } else {
      busy.add("necklace");
      busy.add("earrings");
      busy.add("teeka");
      busy.add("pasa");
    }
  }
  return busy;
}

export function availablePartsForItem(
  item: JewelleryPartFlags,
  booked: Set<JewelleryPartKey>,
): JewelleryPartKey[] {
  return partsPresentOnItem(item).filter((p) => !booked.has(p));
}

export function allPartsBooked(item: JewelleryPartFlags, booked: Set<JewelleryPartKey>): boolean {
  const present = partsPresentOnItem(item);
  if (!present.length) return booked.size > 0;
  return present.every((p) => booked.has(p));
}
