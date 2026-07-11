/**
 * Category / subcategory helpers for Dress Checker search scope.
 */
import { SUB_CATEGORIES } from "@/lib/constants";
import {
  JEWELLERY_SUBCATEGORIES,
  MENS_SUBCATEGORIES,
  WOMENS_SUBCATEGORIES,
  inferSubCategory,
  resolveCategoryGroup,
} from "@/lib/recognitionPipeline/constants";

export type DressSearchMode = "AUTO" | "MANUAL" | "ALL";

export type CategorySearchScope = {
  category?: string;
  subCategory?: string;
};

/** Style + inventory-tier subcategory options for a base category. */
export function subcategoryOptionsForCategory(category: string): string[] {
  if (!category) {
    return [
      ...SUB_CATEGORIES,
      ...WOMENS_SUBCATEGORIES,
      ...MENS_SUBCATEGORIES,
      ...JEWELLERY_SUBCATEGORIES,
    ].filter((v, i, a) => a.indexOf(v) === i);
  }

  const group = resolveCategoryGroup(category);
  const style =
    group === "womens"
      ? WOMENS_SUBCATEGORIES.filter((s) => {
          const lower = s.toLowerCase();
          const cat = category.toLowerCase();
          return lower.includes(cat) || cat.includes(lower.split(" ").pop() || "") || s === category;
        })
      : group === "mens"
        ? MENS_SUBCATEGORIES.filter((s) => {
            const lower = s.toLowerCase();
            const cat = category.toLowerCase();
            return lower.includes(cat) || s === category || cat.includes(lower);
          })
        : group === "jewellery"
          ? [...JEWELLERY_SUBCATEGORIES]
          : [];

  // Always include inventory tier options + full style list for the group when filter is thin.
  const groupAll =
    group === "womens"
      ? [...WOMENS_SUBCATEGORIES]
      : group === "mens"
        ? [...MENS_SUBCATEGORIES]
        : group === "jewellery"
          ? [...JEWELLERY_SUBCATEGORIES]
          : [];

  const merged = [...SUB_CATEGORIES, ...style, ...groupAll];
  return merged.filter((v, i, a) => a.indexOf(v) === i);
}

export function formatSearchScopeLabel(scope: CategorySearchScope): string {
  const cat = (scope.category || "").trim();
  const sub = (scope.subCategory || "").trim();
  if (!cat && !sub) return "Searching entire inventory.";
  if (cat && sub) return `Searching in: ${cat} > ${sub}`;
  if (cat) return `Searching in: ${cat}`;
  return `Searching in: ${sub}`;
}

export function inferStyleSubCategory(category: string, nameHint = ""): string {
  if (!category) return "";
  return inferSubCategory(category, nameHint, resolveCategoryGroup(category));
}

/**
 * Build SQL AND-clauses + params for category/subcategory filters.
 * Subcategory matches inventory tier OR AI garment_attributes style label.
 *
 * @param startParam Index of next `$N` placeholder (1-based). Embedding is usually $1, limit $2.
 */
export function buildCategoryFilterSql(
  scope: CategorySearchScope,
  startParam: number,
  profileAlias = "p",
  itemAlias = "c",
): { sql: string; params: string[] } {
  const params: string[] = [];
  const parts: string[] = [];
  let n = startParam;

  const category = (scope.category || "").trim();
  const subCategory = (scope.subCategory || "").trim();

  if (category) {
    parts.push(`${itemAlias}.category = $${n}`);
    params.push(category);
    n += 1;
  }

  if (subCategory) {
    parts.push(`(
      ${itemAlias}.sub_category = $${n}
      OR COALESCE(${profileAlias}.garment_attributes->>'subcategory', '') = $${n}
      OR COALESCE(${profileAlias}.garment_attributes->>'subCategory', '') = $${n}
    )`);
    params.push(subCategory);
    n += 1;
  }

  return {
    sql: parts.length ? `AND ${parts.join(" AND ")}` : "",
    params,
  };
}

/** Majority-vote category (and optional subcategory) from ANN shortlist rows. */
export function voteCategoryFromCandidates(
  rows: Array<{ category: string; subCategory?: string | null; similarity: number }>,
): { category: string; subCategory: string; confidence: number } {
  if (!rows.length) return { category: "", subCategory: "", confidence: 0 };

  const catScores = new Map<string, number>();
  const subScores = new Map<string, number>();
  for (const row of rows) {
    const cat = (row.category || "").trim();
    if (cat) catScores.set(cat, (catScores.get(cat) || 0) + row.similarity);
    const sub = (row.subCategory || "").trim();
    if (sub) subScores.set(sub, (subScores.get(sub) || 0) + row.similarity);
  }

  let bestCat = "";
  let bestCatScore = 0;
  for (const [k, v] of catScores) {
    if (v > bestCatScore) {
      bestCat = k;
      bestCatScore = v;
    }
  }

  let bestSub = "";
  let bestSubScore = 0;
  for (const [k, v] of subScores) {
    if (v > bestSubScore) {
      bestSub = k;
      bestSubScore = v;
    }
  }

  const total = rows.reduce((s, r) => s + r.similarity, 0) || 1;
  return {
    category: bestCat,
    subCategory: bestSub,
    confidence: Math.round((bestCatScore / total) * 100),
  };
}
