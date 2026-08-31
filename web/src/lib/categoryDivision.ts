import type { PackingDivision } from "@/lib/packingDivision";
import { BASE_ACCESSORY, BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";
import {
  JEWELLERY_SUBCATEGORIES,
  MENS_SUBCATEGORIES,
  resolveCategoryGroup,
  WOMENS_SUBCATEGORIES,
} from "@/lib/recognitionPipeline/constants";

export type CategoryDivisionLists = {
  mens: readonly string[];
  womens: readonly string[];
  jewellery: readonly string[];
};

const PLACEHOLDER_CATEGORIES = new Set(["", "other"]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inList(value: string, list: readonly string[]): boolean {
  const v = normalize(value);
  if (!v) return false;
  return list.some((name) => normalize(name) === v);
}

/** Infer Men / Women / Jewellery from a category label (built-in lists only). */
export function inferDivisionGroupFromLabel(label: string): PackingDivision | null {
  const c = String(label || "").trim();
  if (!c || PLACEHOLDER_CATEGORIES.has(normalize(c))) return null;
  if (inList(c, BASE_MENS) || inList(c, MENS_SUBCATEGORIES)) return "mens";
  if (inList(c, BASE_WOMENS) || inList(c, WOMENS_SUBCATEGORIES)) return "womens";
  if (inList(c, BASE_JEWELLERY) || inList(c, JEWELLERY_SUBCATEGORIES)) return "jewellery";
  if (inList(c, BASE_ACCESSORY)) return "womens";
  const group = resolveCategoryGroup(c);
  if (group === "mens" || group === "womens" || group === "jewellery") return group;
  return null;
}

/** Prefer a real inventory/booking category over the placeholder "Other". */
export function resolveEffectiveCategory(
  bookingCategory?: string | null,
  inventoryCategory?: string | null,
  inventorySubCategory?: string | null,
): string {
  const bc = (bookingCategory || "").trim();
  const ic = (inventoryCategory || "").trim();
  const sc = (inventorySubCategory || "").trim();
  if (bc && !PLACEHOLDER_CATEGORIES.has(normalize(bc))) return bc;
  if (ic && !PLACEHOLDER_CATEGORIES.has(normalize(ic))) return ic;
  if (sc && !PLACEHOLDER_CATEGORIES.has(normalize(sc))) return sc;
  return bc || ic || sc || "";
}

function uniqueNames(...groups: Array<readonly string[]>): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const name of group) {
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Build Men / Women / Jewellery lookup lists from Manage Categories data. */
export function categoryDivisionListsFromAllCategories(categories: {
  mens_categories: readonly string[];
  womens_categories: readonly string[];
  jewellery_categories: readonly string[];
  accessory_categories?: readonly string[];
  other_categories?: readonly string[];
}): CategoryDivisionLists {
  const mens = uniqueNames(categories.mens_categories, MENS_SUBCATEGORIES);
  const womens = uniqueNames(
    categories.womens_categories,
    categories.accessory_categories || [],
    WOMENS_SUBCATEGORIES,
  );
  for (const name of categories.other_categories || []) {
    if (PLACEHOLDER_CATEGORIES.has(normalize(name))) continue;
    if (!womens.includes(name)) womens.push(name);
  }
  const jewellery = uniqueNames(categories.jewellery_categories, JEWELLERY_SUBCATEGORIES);
  return { mens, womens, jewellery };
}

export function divisionFromCategoryLists(
  label: string | null | undefined,
  lists: CategoryDivisionLists,
): PackingDivision | null {
  const c = String(label || "").trim();
  if (!c || PLACEHOLDER_CATEGORIES.has(normalize(c))) return null;
  const v = normalize(c);
  if (lists.mens.some((name) => normalize(name) === v)) return "mens";
  if (lists.jewellery.some((name) => normalize(name) === v)) return "jewellery";
  if (lists.womens.some((name) => normalize(name) === v)) return "womens";
  return null;
}
