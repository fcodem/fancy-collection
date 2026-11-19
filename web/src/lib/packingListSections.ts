import {
  PACKING_DIVISIONS,
  packingDivision,
  groupSlipItemsForPrint,
  type CategoryDivisionLists,
  type PackingDivision,
} from "@/lib/packingDivision";

export type PackingListItemLike = {
  category?: string | null;
  dress_name?: string | null;
  sub_category?: string | null;
};

export type PackingListBookingLike = {
  items?: PackingListItemLike[];
};

export function packingDivisionForListItem(
  item: PackingListItemLike,
  categoryLists: CategoryDivisionLists,
): PackingDivision {
  return packingDivision(item.category, item.dress_name, item.sub_category, categoryLists);
}

export function countPackingItemsByDivision(
  rows: PackingListBookingLike[],
  categoryLists: CategoryDivisionLists,
): Record<PackingDivision, number> {
  const counts: Record<PackingDivision, number> = { mens: 0, womens: 0, jewellery: 0 };
  for (const booking of rows) {
    for (const item of booking.items ?? []) {
      counts[packingDivisionForListItem(item, categoryLists)]++;
    }
  }
  return counts;
}

export function filterPackingBookingItemsForDivision<
  T extends PackingListBookingLike & Record<string, unknown>,
>(booking: T, division: PackingDivision, categoryLists: CategoryDivisionLists): T | null {
  const items = (booking.items ?? []).filter(
    (item) => packingDivisionForListItem(item, categoryLists) === division,
  );
  if (!items.length) return null;
  return { ...booking, items };
}

export function packingSectionsForRows<T extends PackingListBookingLike & Record<string, unknown>>(
  rows: T[],
  categoryLists: CategoryDivisionLists,
  visibleDivisions: typeof PACKING_DIVISIONS = PACKING_DIVISIONS,
) {
  return visibleDivisions.map((div) => ({
    division: div,
    rows: rows
      .map((booking) => filterPackingBookingItemsForDivision(booking, div.key, categoryLists))
      .filter((booking): booking is T => Boolean(booking)),
  }));
}

export type PackingItemCategoryGroup<T extends PackingListItemLike> = {
  category: string;
  items: T[];
};

/**
 * Within one packing booking (already in a Men/Women/Jewellery section),
 * group dresses by category for "Category: Sherwani" print headers.
 */
export function groupPackingItemsByCategory<T extends PackingListItemLike>(
  items: T[],
  categoryLists?: CategoryDivisionLists,
): PackingItemCategoryGroup<T>[] {
  if (!items.length) return [];
  const sortable = items.map((item, id) => ({
    id,
    category: item.category,
    dressName: item.dress_name,
    item: item.sub_category ? { subCategory: item.sub_category } : null,
  }));
  const groups = groupSlipItemsForPrint(sortable, categoryLists);
  return groups.flatMap((div) =>
    div.categories.map((cat) => ({
      category: cat.category,
      items: cat.items.map((row) => items[row.id as number]),
    })),
  );
}

/** "1. Mens", "2. Women", "3. Jewellery" — packing print order labels. */
export function packingDivisionOrderLabel(divisionKey: PackingDivision): string {
  const idx = PACKING_DIVISIONS.findIndex((d) => d.key === divisionKey);
  const label = PACKING_DIVISIONS.find((d) => d.key === divisionKey)?.label || divisionKey;
  return idx >= 0 ? `${idx + 1}. ${label}` : label;
}
