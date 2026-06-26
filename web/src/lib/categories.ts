import { unstable_cache } from "next/cache";
import prisma from "./prisma";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
} from "./constants";
import { findHiddenCategoryNames } from "./categoryTables";

async function loadAllCategories() {
  const [custom, hiddenNames] = await Promise.all([
    prisma.customCategory.findMany({ where: { active: true } }),
    findHiddenCategoryNames(),
  ]);
  const hiddenSet = new Set(hiddenNames);
  const mens = BASE_MENS.filter((n) => !hiddenSet.has(n));
  const womens = BASE_WOMENS.filter((n) => !hiddenSet.has(n));
  const jewellery = BASE_JEWELLERY.filter((n) => !hiddenSet.has(n));
  const accessory = BASE_ACCESSORY.filter((n) => !hiddenSet.has(n));
  const other = ["Other"];

  for (const c of custom) {
    if (c.group === "mens" && !mens.includes(c.name)) mens.push(c.name);
    else if (c.group === "womens" && !womens.includes(c.name)) womens.push(c.name);
    else if (c.group === "jewellery" && !jewellery.includes(c.name)) jewellery.push(c.name);
    else if (c.group === "accessory" && !accessory.includes(c.name)) accessory.push(c.name);
    else if (c.group === "other" && !other.includes(c.name)) other.push(c.name);
  }

  return {
    mens_categories: mens,
    womens_categories: womens,
    jewellery_categories: jewellery,
    accessory_categories: accessory,
    other_categories: other,
    all_categories: [...mens, ...womens, ...jewellery, ...accessory, ...other],
  };
}

export const getAllCategories = unstable_cache(loadAllCategories, ["all-categories"], { revalidate: 120 });

export function isMensCategory(category: string, mens: string[]): boolean {
  return mens.includes(category);
}
