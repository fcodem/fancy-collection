import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";
import {
  JEWELLERY_SUBCATEGORIES,
  MENS_SUBCATEGORIES,
  resolveCategoryGroup,
  WOMENS_SUBCATEGORIES,
} from "@/lib/recognitionPipeline/constants";

export type PackingDivision = "mens" | "womens" | "jewellery" | "other";

export const PACKING_DIVISIONS: Array<{
  key: PackingDivision;
  label: string;
}> = [
  { key: "mens", label: "Mens" },
  { key: "womens", label: "Women" },
  { key: "jewellery", label: "Jewellery" },
  { key: "other", label: "Other" },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inList(value: string, list: readonly string[]): boolean {
  const v = normalize(value);
  if (!v) return false;
  return list.some((name) => normalize(name) === v);
}

function divisionFromLabel(label?: string | null): PackingDivision | null {
  const c = String(label || "").trim();
  if (!c) return null;
  if (inList(c, BASE_MENS) || inList(c, MENS_SUBCATEGORIES)) return "mens";
  if (inList(c, BASE_WOMENS) || inList(c, WOMENS_SUBCATEGORIES)) return "womens";
  if (inList(c, BASE_JEWELLERY) || inList(c, JEWELLERY_SUBCATEGORIES)) return "jewellery";
  const group = resolveCategoryGroup(c);
  return group === "other" ? null : group;
}

function divisionFromText(text: string): PackingDivision {
  const t = text.toLowerCase();
  if (
    /jewell|kundan|polki|necklace|earring|bangle|nath|teeka|pasa|sheeshpatti|hathfool|kamarband|maang|matha|anklet|nose ring/.test(
      t,
    )
  ) {
    return "jewellery";
  }
  if (
    /crop top|bodycon|sharara|anarkali|lehenga|lehnga|saree|sari|gown|choli|blouse|reception|bridal lehenga/.test(
      t,
    )
  ) {
    return "womens";
  }
  if (/sherwani|jodhpuri|tuxedo|indowestern|indo western|kurta set|kurta|coat suit|blazer/.test(t)) {
    return "mens";
  }
  if (/\bsuit\b/.test(t)) {
    return /women|ladies|lehenga|crop|sharara|anarkali|gown|saree/.test(t) ? "womens" : "mens";
  }
  return "other";
}

/** Classify a packing row into Mens / Women / Jewellery using category, inventory sub-category, and dress name. */
export function packingDivision(
  category?: string | null,
  dressName?: string | null,
  subCategory?: string | null,
): PackingDivision {
  for (const label of [category, subCategory, dressName]) {
    const fromLabel = divisionFromLabel(label);
    if (fromLabel) return fromLabel;
  }

  const text = [category, subCategory, dressName].filter(Boolean).join(" ").trim();
  if (!text) return "other";
  return divisionFromText(text);
}
