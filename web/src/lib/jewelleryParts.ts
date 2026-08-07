/** Shared bridal jewellery set component helpers. */

export type JewelleryPartKey =
  | "necklace"
  | "earrings"
  | "teeka"
  | "pasa"
  | "sheeshpatti"
  | "nath"
  | "hathfool"
  | "kamarband"
  | "rings"
  | "longhar";

export type JewelleryPartFlags = {
  hasNecklace?: boolean;
  hasEarrings?: boolean;
  hasTeeka?: boolean;
  hasPasa?: boolean;
  hasSheeshpatti?: boolean;
  hasNath?: boolean;
  hasHathfool?: boolean;
  hasKamarband?: boolean;
  hasRings?: boolean;
  hasLongHar?: boolean;
};

export type JewelleryPickFlags = {
  pickNecklace?: boolean;
  pickEarrings?: boolean;
  pickTeeka?: boolean;
  pickPasa?: boolean;
  pickSheeshpatti?: boolean;
  pickNath?: boolean;
  pickHathfool?: boolean;
  pickKamarband?: boolean;
  pickRings?: boolean;
  pickLongHar?: boolean;
};

export const JEWELLERY_PART_DEFS: Array<{
  key: JewelleryPartKey;
  label: string;
  /** Label used on Add/Edit inventory “Set includes” checkboxes. */
  presentLabel: string;
  hasField: keyof JewelleryPartFlags;
  pickField: keyof JewelleryPickFlags;
  formHasKey: string;
  formPickKey: string;
  dbHasColumn: string;
  dbPickColumn: string;
}> = [
  {
    key: "necklace",
    label: "Necklace",
    presentLabel: "Necklace present",
    hasField: "hasNecklace",
    pickField: "pickNecklace",
    formHasKey: "has_necklace",
    formPickKey: "pick_necklace",
    dbHasColumn: "has_necklace",
    dbPickColumn: "pick_necklace",
  },
  {
    key: "earrings",
    label: "Earrings",
    presentLabel: "Earrings present",
    hasField: "hasEarrings",
    pickField: "pickEarrings",
    formHasKey: "has_earrings",
    formPickKey: "pick_earrings",
    dbHasColumn: "has_earrings",
    dbPickColumn: "pick_earrings",
  },
  {
    key: "teeka",
    label: "Teeka",
    presentLabel: "Teeka present",
    hasField: "hasTeeka",
    pickField: "pickTeeka",
    formHasKey: "has_teeka",
    formPickKey: "pick_teeka",
    dbHasColumn: "has_teeka",
    dbPickColumn: "pick_teeka",
  },
  {
    key: "pasa",
    label: "Pasa",
    presentLabel: "Pasa present",
    hasField: "hasPasa",
    pickField: "pickPasa",
    formHasKey: "has_pasa",
    formPickKey: "pick_pasa",
    dbHasColumn: "has_pasa",
    dbPickColumn: "pick_pasa",
  },
  {
    key: "sheeshpatti",
    label: "Sheeshpatti",
    presentLabel: "Sheeshpatti present",
    hasField: "hasSheeshpatti",
    pickField: "pickSheeshpatti",
    formHasKey: "has_sheeshpatti",
    formPickKey: "pick_sheeshpatti",
    dbHasColumn: "has_sheeshpatti",
    dbPickColumn: "pick_sheeshpatti",
  },
  {
    key: "nath",
    label: "Nath",
    presentLabel: "Nath option",
    hasField: "hasNath",
    pickField: "pickNath",
    formHasKey: "has_nath",
    formPickKey: "pick_nath",
    dbHasColumn: "has_nath",
    dbPickColumn: "pick_nath",
  },
  {
    key: "hathfool",
    label: "Hathfool",
    presentLabel: "Hathfool present",
    hasField: "hasHathfool",
    pickField: "pickHathfool",
    formHasKey: "has_hathfool",
    formPickKey: "pick_hathfool",
    dbHasColumn: "has_hathfool",
    dbPickColumn: "pick_hathfool",
  },
  {
    key: "kamarband",
    label: "Kamarband",
    presentLabel: "Kamarband present",
    hasField: "hasKamarband",
    pickField: "pickKamarband",
    formHasKey: "has_kamarband",
    formPickKey: "pick_kamarband",
    dbHasColumn: "has_kamarband",
    dbPickColumn: "pick_kamarband",
  },
  {
    key: "rings",
    label: "Rings",
    presentLabel: "Rings present",
    hasField: "hasRings",
    pickField: "pickRings",
    formHasKey: "has_rings",
    formPickKey: "pick_rings",
    dbHasColumn: "has_rings",
    dbPickColumn: "pick_rings",
  },
  {
    key: "longhar",
    label: "Long Har",
    presentLabel: "Long Har option",
    hasField: "hasLongHar",
    pickField: "pickLongHar",
    formHasKey: "has_long_har",
    formPickKey: "pick_long_har",
    dbHasColumn: "has_long_har",
    dbPickColumn: "pick_long_har",
  },
];

export function itemHasJewelleryParts(item: JewelleryPartFlags): boolean {
  return JEWELLERY_PART_DEFS.some((d) => !!item[d.hasField]);
}

export function partsPresentOnItem(item: JewelleryPartFlags): JewelleryPartKey[] {
  return JEWELLERY_PART_DEFS.filter((d) => !!item[d.hasField]).map((d) => d.key);
}

export function partsPickedOnSelection(sel: JewelleryPickFlags): JewelleryPartKey[] {
  return JEWELLERY_PART_DEFS.filter((d) => !!sel[d.pickField]).map((d) => d.key);
}

export function formatJewelleryPartsLabel(parts: JewelleryPartKey[] | JewelleryPickFlags): string {
  const keys = Array.isArray(parts) ? parts : partsPickedOnSelection(parts);
  if (!keys.length) return "";
  return keys.map((k) => JEWELLERY_PART_DEFS.find((d) => d.key === k)?.label || k).join(", ");
}

export function picksFromKeys(keys: JewelleryPartKey[]): JewelleryPickFlags {
  const out: JewelleryPickFlags = {};
  for (const d of JEWELLERY_PART_DEFS) {
    out[d.pickField] = keys.includes(d.key);
  }
  return out;
}

export function selectionUsesParts(sel: JewelleryPickFlags): boolean {
  return JEWELLERY_PART_DEFS.some((d) => !!sel[d.pickField]);
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
      for (const d of JEWELLERY_PART_DEFS) busy.add(d.key);
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

/** Parse inventory form “has_*” checkboxes into flags. */
export function jewelleryHasFlagsFromForm(
  get: (key: string) => FormDataEntryValue | null,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const d of JEWELLERY_PART_DEFS) {
    out[d.formHasKey] = get(d.formHasKey) === "1";
  }
  return out;
}
