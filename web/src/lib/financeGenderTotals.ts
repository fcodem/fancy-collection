import { resolveEffectiveCategory } from "@/lib/categoryDivision";
import {
  divisionChartLabel,
  packingDivision,
  packingDivisionForItem,
  type CategoryDivisionLists,
  type PackingDivision,
} from "@/lib/packingDivision";

export type { CategoryDivisionLists };

type FinanceBookingItem = {
  category?: string | null;
  dressName?: string | null;
  item?: { category?: string | null; subCategory?: string | null } | null;
};

const PLACEHOLDER_CATEGORIES = new Set(["", "other"]);

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

/** Dress category label for finance tables (Crop Top, Lehenga, Sherwani, etc.). */
export function financeItemCategoryKey(
  bookingCategory?: string | null,
  inventoryCategory?: string | null,
  dressName?: string | null,
  inventorySubCategory?: string | null,
  lists?: CategoryDivisionLists,
): string {
  const resolved = resolveEffectiveCategory(bookingCategory, inventoryCategory, inventorySubCategory);
  if (resolved && !PLACEHOLDER_CATEGORIES.has(normalizeCategory(resolved))) {
    return resolved;
  }
  return divisionChartLabel(
    packingDivision(resolved || bookingCategory, dressName, inventorySubCategory, lists),
  );
}

export function financeItemCategoryKeyForBookingItem(
  bi: FinanceBookingItem,
  lists?: CategoryDivisionLists,
): string {
  return financeItemCategoryKey(
    bi.category,
    bi.item?.category,
    bi.dressName,
    bi.item?.subCategory,
    lists,
  );
}

/** Classify a dress line into Men / Women / Jewellery for summary totals. */
export function financeItemDivision(
  category?: string | null,
  dressName?: string | null,
  subCategory?: string | null,
  lists?: CategoryDivisionLists,
): PackingDivision {
  return packingDivision(category, dressName, subCategory, lists);
}

export function financeItemDivisionForBookingItem(
  bi: FinanceBookingItem,
  lists?: CategoryDivisionLists,
): PackingDivision {
  return packingDivisionForItem(
    bi.category,
    bi.item?.category,
    bi.dressName,
    bi.item?.subCategory,
    lists,
  );
}

export function financeDivisionLabel(
  category?: string | null,
  dressName?: string | null,
  subCategory?: string | null,
  lists?: CategoryDivisionLists,
): string {
  return divisionChartLabel(financeItemDivision(category, dressName, subCategory, lists));
}

/** Sum booking-item prices into men / women / jewellery buckets. */
export function sumPricesByFinanceDivision(
  items: Array<{
    category?: string | null;
    dressName?: string | null;
    price: number;
    isCancelled?: boolean;
    item?: { category?: string | null; subCategory?: string | null } | null;
  }>,
  lists?: CategoryDivisionLists,
): Record<PackingDivision, number> {
  const totals: Record<PackingDivision, number> = {
    mens: 0,
    womens: 0,
    jewellery: 0,
  };
  for (const bi of items) {
    if (bi.isCancelled) continue;
    const div = financeItemDivisionForBookingItem(bi, lists);
    totals[div] += bi.price;
  }
  return totals;
}

/** Refund amounts keyed by dress category → men / women / jewellery buckets. */
export function refundAmountsByFinanceDivision(
  refundCats: Record<string, number>,
  lists?: CategoryDivisionLists,
): Record<PackingDivision, number> {
  const totals: Record<PackingDivision, number> = {
    mens: 0,
    womens: 0,
    jewellery: 0,
  };
  for (const [cat, amt] of Object.entries(refundCats)) {
    totals[financeItemDivision(cat, undefined, undefined, lists)] += amt;
  }
  return totals;
}
