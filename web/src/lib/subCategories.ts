import { unstable_cache } from "next/cache";
import { findActiveSubCategoryNames } from "./categoryTables";

async function loadAllSubCategories() {
  return findActiveSubCategoryNames();
}

export const getAllSubCategories = unstable_cache(
  loadAllSubCategories,
  ["all-sub-categories"],
  { revalidate: 120 },
);
