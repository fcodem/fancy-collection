import {
  JEWELLERY_CATEGORIES,
  MENS_CATEGORIES,
  WOMENS_CATEGORIES,
} from "../constants";
import type { CategoryGroup } from "./types";

/** Hybrid similarity weights — must sum to 1.0 */
export const HYBRID_WEIGHTS = {
  visual: 0.35,
  colour: 0.2,
  embroidery: 0.15,
  border: 0.1,
  silhouette: 0.1,
  sleeve: 0.05,
  neckline: 0.05,
} as const;

export const CONFIDENCE_BANDS = {
  reliable: 90,
  veryLikely: 80,
  possible: 70,
  autoSelectMin: 80,
} as const;

export const COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD = 35;
/** @deprecated use COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD */
export const COLOUR_MISMATCH_REJECT_THRESHOLD = COLOUR_MISMATCH_HEAVY_PENALTY_THRESHOLD;
export const CATEGORY_MISMATCH_REJECT = true;

export const WOMENS_SUBCATEGORIES = [
  "Bridal Lehenga",
  "Non Bridal Lehenga",
  "Gown",
  "Saree",
  "Sharara",
  "Anarkali",
  "Suit",
  "Crop Top",
  "Bodycon",
  "Reception Gown",
  "Lehenga",
] as const;

export const MENS_SUBCATEGORIES = [
  "Sherwani",
  "Tuxedo",
  "Jodhpuri",
  "Coat Suit",
  "Indo Western",
  "Kurta Set",
  "Indowestern",
  "Suit",
] as const;

export const JEWELLERY_SUBCATEGORIES = [
  "Bridal",
  "Kundan",
  "Polki",
  "AD",
  "Temple",
  "Oxidized",
  "Diamond",
  "Kundan Jewellery",
  "Polki Jewellery",
  "AD Jewellery",
  "Bridal Jewellery",
] as const;

export function resolveCategoryGroup(category: string): CategoryGroup {
  if (MENS_CATEGORIES.includes(category)) return "mens";
  if (WOMENS_CATEGORIES.includes(category)) return "womens";
  if (JEWELLERY_CATEGORIES.includes(category)) return "jewellery";
  return "other";
}

export function inferSubCategory(
  category: string,
  name: string,
  group: CategoryGroup,
): string {
  const text = `${category} ${name}`.toLowerCase();
  if (group === "womens") {
    if (text.includes("bridal") && text.includes("lehenga")) return "Bridal Lehenga";
    if (text.includes("lehenga")) return "Non Bridal Lehenga";
    if (text.includes("sharara")) return "Sharara";
    if (text.includes("anarkali")) return "Anarkali";
    if (text.includes("saree")) return "Saree";
    if (text.includes("reception")) return "Reception Gown";
    if (text.includes("crop")) return "Crop Top";
    if (text.includes("bodycon")) return "Bodycon";
    if (text.includes("gown")) return "Gown";
    if (text.includes("suit")) return "Suit";
    return category;
  }
  if (group === "mens") {
    if (text.includes("sherwani")) return "Sherwani";
    if (text.includes("jodhpuri")) return "Jodhpuri";
    if (text.includes("tuxedo")) return "Tuxedo";
    if (text.includes("kurta")) return "Kurta Set";
    if (text.includes("indo")) return "Indo Western";
    if (text.includes("coat")) return "Coat Suit";
    return category;
  }
  if (group === "jewellery") {
    if (text.includes("kundan")) return "Kundan";
    if (text.includes("polki")) return "Polki";
    if (text.includes("bridal")) return "Bridal";
    if (text.includes("temple")) return "Temple";
    if (text.includes("oxid")) return "Oxidized";
    if (text.includes("diamond")) return "Diamond";
    if (text.includes("ad ")) return "AD";
    return category;
  }
  return category;
}
