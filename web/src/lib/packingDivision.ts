import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";

export type PackingDivision = "mens" | "womens" | "jewellery" | "other";

export const PACKING_DIVISIONS: Array<{
  key: PackingDivision;
  label: string;
}> = [
  { key: "mens", label: "Mens" },
  { key: "womens", label: "Women" },
  { key: "jewellery", label: "Jewellery" },
  { key: "other", label: "Other" },
];

function inList(category: string, list: string[]): boolean {
  const c = category.trim().toLowerCase();
  if (!c) return false;
  return list.some((name) => name.toLowerCase() === c);
}

export function packingDivision(category?: string | null): PackingDivision {
  const c = String(category || "").trim();
  if (inList(c, BASE_MENS)) return "mens";
  if (inList(c, BASE_WOMENS)) return "womens";
  if (inList(c, BASE_JEWELLERY)) return "jewellery";
  const lower = c.toLowerCase();
  if (
    /jewellery|kundan|polki|necklace|earring|bangle|nath|teeka|pasa|sheeshpatti|hathfool|kamarband/.test(
      lower,
    )
  ) {
    return "jewellery";
  }
  return "other";
}
