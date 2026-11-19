import {
  PACKING_DIVISIONS,
  packingDivision,
  type PackingDivision,
} from "@/lib/packingDivision";
import {
  groupPackingItemsByCategory,
  packingDivisionOrderLabel,
} from "@/lib/packingListSections";
import type { PrintBookingRecord, PrintDressRow } from "@/lib/services/dashboardPrintTypes";

export type DashboardPrintDivisionSection = {
  division: PackingDivision;
  label: string;
  records: PrintBookingRecord[];
};

/**
 * Split delivery/return print bookings into Men → Women → Jewellery.
 * A multi-dress booking can appear in more than one section (dresses filtered).
 */
export function groupDashboardPrintByDivision(
  records: PrintBookingRecord[],
): DashboardPrintDivisionSection[] {
  return PACKING_DIVISIONS.map((div) => {
    const sectionRecords: PrintBookingRecord[] = [];
    for (const r of records) {
      const dresses = r.dresses.filter(
        (d) => packingDivision(d.category || "", d.label || "") === div.key,
      );
      if (!dresses.length) continue;
      sectionRecords.push({ ...r, dresses });
    }
    return {
      division: div.key,
      label: packingDivisionOrderLabel(div.key),
      records: sectionRecords,
    };
  }).filter((s) => s.records.length > 0);
}

/** Group dresses inside one print card by category for Category: headers. */
export function groupPrintDressesByCategory(dresses: PrintDressRow[]) {
  return groupPackingItemsByCategory(
    dresses.map((d) => ({
      dress_name: d.label,
      category: d.category,
      row: d,
    })),
  ).map((g) => ({
    category: g.category,
    items: g.items.map((entry) => entry.row),
  }));
}
