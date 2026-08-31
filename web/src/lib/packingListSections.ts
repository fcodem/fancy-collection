import {
  PACKING_DIVISIONS,
  packingDivision,
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
