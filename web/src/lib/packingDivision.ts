import {
  categoryDivisionListsFromAllCategories,
  divisionFromCategoryLists,
  resolveEffectiveCategory,
  type CategoryDivisionLists,
} from "@/lib/categoryDivision";
import { BASE_ACCESSORY, BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";
import {
  JEWELLERY_SUBCATEGORIES,
  MENS_SUBCATEGORIES,
  resolveCategoryGroup,
  WOMENS_SUBCATEGORIES,
} from "@/lib/recognitionPipeline/constants";

export type { CategoryDivisionLists };
export { categoryDivisionListsFromAllCategories, resolveEffectiveCategory };

export type PackingDivision = "mens" | "womens" | "jewellery";

export const DIVISION_CHART_LABELS: Record<PackingDivision, string> = {
  mens: "Men",
  womens: "Women",
  jewellery: "Jewellery",
};

export function divisionChartLabel(div: PackingDivision): string {
  return DIVISION_CHART_LABELS[div];
}

export const PACKING_DIVISION_FILTER_PREFIX = "division:";

export function packingDivisionFilterValue(div: PackingDivision): string {
  return `${PACKING_DIVISION_FILTER_PREFIX}${div}`;
}

export function parsePackingDivisionFilter(value?: string | null): PackingDivision | null {
  const v = (value || "").trim();
  if (!v.startsWith(PACKING_DIVISION_FILTER_PREFIX)) return null;
  const key = v.slice(PACKING_DIVISION_FILTER_PREFIX.length) as PackingDivision;
  if (key === "mens" || key === "womens" || key === "jewellery") return key;
  return null;
}

export function packingDivisionFilterLabel(div: PackingDivision): string {
  if (div === "mens") return "All Men's";
  if (div === "womens") return "All Women's";
  return "All Jewellery";
}

export function formatPackingCategoryFilterLabel(value: string): string {
  const division = parsePackingDivisionFilter(value);
  if (division) return packingDivisionFilterLabel(division);
  return value;
}

const DIVISION_SORT_ORDER: PackingDivision[] = ["mens", "womens", "jewellery"];

export function formatFinanceCategoryLabel(key: string): string {
  if (key === "mens" || key === "womens" || key === "jewellery") {
    return divisionChartLabel(key);
  }
  return key;
}

export function sortFinanceCategoryKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = DIVISION_SORT_ORDER.indexOf(a as PackingDivision);
    const bi = DIVISION_SORT_ORDER.indexOf(b as PackingDivision);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** Sort dress categories Men → Women → Jewellery, then A–Z within each group. */
export function sortFinanceDressCategoryKeys(
  keys: string[],
  lists?: CategoryDivisionLists,
): string[] {
  const divisionOrder: PackingDivision[] = ["mens", "womens", "jewellery"];
  const rank = (key: string) => {
    if (key === "Custom Orders") return 100;
    const idx = divisionOrder.indexOf(packingDivision(key, null, null, lists));
    return idx === -1 ? 50 : idx;
  };
  return [...keys].sort((a, b) => {
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    return a.localeCompare(b);
  });
}

export const PACKING_DIVISIONS: Array<{
  key: PackingDivision;
  label: string;
}> = [
  { key: "mens", label: "Mens" },
  { key: "womens", label: "Women" },
  { key: "jewellery", label: "Jewellery" },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inList(value: string, list: readonly string[]): boolean {
  const v = normalize(value);
  if (!v) return false;
  return list.some((name) => normalize(name) === v);
}

function divisionFromLabel(
  label?: string | null,
  lists?: CategoryDivisionLists,
): PackingDivision | null {
  const c = String(label || "").trim();
  if (!c || normalize(c) === "other") return null;
  if (lists) {
    const fromLists = divisionFromCategoryLists(c, lists);
    if (fromLists) return fromLists;
  }
  if (inList(c, BASE_MENS) || inList(c, MENS_SUBCATEGORIES)) return "mens";
  if (inList(c, BASE_JEWELLERY) || inList(c, JEWELLERY_SUBCATEGORIES)) return "jewellery";
  if (inList(c, BASE_WOMENS) || inList(c, WOMENS_SUBCATEGORIES)) return "womens";
  if (inList(c, BASE_ACCESSORY)) return "womens";
  const group = resolveCategoryGroup(c);
  if (group === "mens" || group === "womens" || group === "jewellery") return group;
  return null;
}

function divisionFromText(text: string): PackingDivision {
  const t = text.toLowerCase();
  if (
    /jewell|kundan|polki|necklace|earring|bangle|nath|teeka|pasa|sheeshpatti|hathfool|kamarband|maang|matha|anklet|nose ring|mala\b|haar\b|tikka/.test(
      t,
    )
  ) {
    return "jewellery";
  }
  if (
    /crop top|bodycon|sharara|gharara|garara|anarkali|lehenga|lehnga|saree|sari|gown|choli|blouse|reception|bridal|cutwork|cutdana|sabesach|sabyasach|rani\b|pista|stone\b|banarasi|bandhani|chikankari|organza|patola|party wear|haldi|mehendi|cocktail|koti\b|dupatta|clutch|tiara|crown/.test(
      t,
    )
  ) {
    return "womens";
  }
  if (/sherwani|jodhpuri|tuxedo|indowestern|indo western|kurta set|kurta|coat suit|blazer|bandhgala|nehru|waistcoat/.test(t)) {
    return "mens";
  }
  if (/\bsuit\b/.test(t)) {
    return /women|ladies|lehenga|crop|sharara|anarkali|gown|saree/.test(t) ? "womens" : "mens";
  }
  // Boutique rental stock is overwhelmingly women's wear when no keyword matches.
  return "womens";
}

/** Classify a dress into Men / Women / Jewellery using category, sub-category, and dress name. */
export function packingDivision(
  category?: string | null,
  dressName?: string | null,
  subCategory?: string | null,
  lists?: CategoryDivisionLists,
): PackingDivision {
  for (const label of [category, subCategory, dressName]) {
    const fromLabel = divisionFromLabel(label, lists);
    if (fromLabel) return fromLabel;
  }

  const text = [category, subCategory, dressName].filter(Boolean).join(" ").trim();
  if (!text) return "womens";
  return divisionFromText(text);
}

/** Resolve booking vs inventory category, then classify into Men / Women / Jewellery. */
export function packingDivisionForItem(
  bookingCategory?: string | null,
  inventoryCategory?: string | null,
  dressName?: string | null,
  inventorySubCategory?: string | null,
  lists?: CategoryDivisionLists,
): PackingDivision {
  const category = resolveEffectiveCategory(
    bookingCategory,
    inventoryCategory,
    inventorySubCategory,
  );
  return packingDivision(category, dressName, inventorySubCategory, lists);
}
