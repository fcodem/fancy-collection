import { revalidateTag, unstable_cache } from "next/cache";
import prisma from "./prisma";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
} from "./constants";
import { createStaleValueCache } from "./staleValueCache";

export const CATEGORY_CACHE_TAG = "all-categories";
const CATEGORY_TTL_SECONDS = 10 * 60;

type CategoryDbRow = {
  kind: "custom" | "hidden";
  name: string;
  groupName: string | null;
};

async function loadAllCategoriesFromDatabase() {
  // One DB round trip for both category tables. This avoids two simultaneous
  // pool slots on cold starts and cannot recursively retry within one request.
  const rows = await prisma.$queryRaw<CategoryDbRow[]>`
    SELECT 'custom'::text AS kind, name, "group" AS "groupName"
    FROM custom_categories
    WHERE active = true
    UNION ALL
    SELECT 'hidden'::text AS kind, name, NULL::text AS "groupName"
    FROM hidden_categories
  `;
  const custom = rows
    .filter((row) => row.kind === "custom")
    .map((row) => ({ name: row.name, group: row.groupName || "other" }));
  const hiddenNames = rows
    .filter((row) => row.kind === "hidden")
    .map((row) => row.name);
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

const categoryMemoryCache = createStaleValueCache(loadAllCategoriesFromDatabase, {
  ttlMs: CATEGORY_TTL_SECONDS * 1000,
  onRefreshError: () => {
    console.warn("[categories] refresh failed; serving last known successful categories when available");
  },
});

const getTaggedCategories = unstable_cache(
  () => categoryMemoryCache.get(),
  [CATEGORY_CACHE_TAG],
  {
    revalidate: CATEGORY_TTL_SECONDS,
    tags: [CATEGORY_CACHE_TAG],
  },
);

/** Load categories only from pages/services that actually render category controls. */
export async function getAllCategories() {
  return getTaggedCategories();
}

/** Category mutations call this after a successful write. */
export function invalidateCategoryCache() {
  categoryMemoryCache.invalidate();
  try {
    revalidateTag(CATEGORY_CACHE_TAG);
  } catch {
    // Unit scripts/non-Next runtimes have no incremental cache context. The
    // in-process cache has still been invalidated above.
  }
}

export function isMensCategory(category: string, mens: string[]): boolean {
  return mens.includes(category);
}
