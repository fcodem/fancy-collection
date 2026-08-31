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



/** Classify a dress line for finance gender / division totals (uses category + dress name). */

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



/** Refund amounts keyed by category → men / women / jewellery buckets. */

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

