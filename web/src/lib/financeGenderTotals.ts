import { packingDivision, type PackingDivision } from "@/lib/packingDivision";

/** Classify a dress line for finance gender / division totals (uses category + dress name). */
export function financeItemDivision(
  category?: string | null,
  dressName?: string | null,
): PackingDivision {
  return packingDivision(category, dressName);
}

/** Sum booking-item prices into mens / womens / jewellery / other buckets. */
export function sumPricesByFinanceDivision(
  items: Array<{
    category?: string | null;
    dressName?: string | null;
    price: number;
    isCancelled?: boolean;
  }>,
): Record<PackingDivision, number> {
  const totals: Record<PackingDivision, number> = {
    mens: 0,
    womens: 0,
    jewellery: 0,
    other: 0,
  };
  for (const bi of items) {
    if (bi.isCancelled) continue;
    const div = financeItemDivision(bi.category, bi.dressName);
    totals[div] += bi.price;
  }
  return totals;
}

/** Refund amounts keyed by category → gender buckets (category-only; no dress name on refunds). */
export function refundAmountsByFinanceDivision(
  refundCats: Record<string, number>,
): Record<PackingDivision, number> {
  const totals: Record<PackingDivision, number> = {
    mens: 0,
    womens: 0,
    jewellery: 0,
    other: 0,
  };
  for (const [cat, amt] of Object.entries(refundCats)) {
    totals[financeItemDivision(cat)] += amt;
  }
  return totals;
}
