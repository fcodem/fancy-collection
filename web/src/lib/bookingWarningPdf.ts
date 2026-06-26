import type { BookingWarningRecord } from "@/lib/bookingDetails";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";

export type ItemWarningSource = {
  item_id?: number;
  display_name?: string;
  dress_name?: string;
  returning_warning?: BookingWarningRecord | null;
  booked_warning?: BookingWarningRecord | null;
};

export function warningPanelsFromItems(items: ItemWarningSource[]): PdfWarningPanel[] {
  const panels: PdfWarningPanel[] = [];
  for (const item of items) {
    const dressLabel = item.display_name || item.dress_name;
    if (item.returning_warning) {
      panels.push({ variant: "returning", dressLabel, w: item.returning_warning });
    }
    if (item.booked_warning) {
      panels.push({ variant: "booked", dressLabel, w: item.booked_warning });
    }
  }
  return panels;
}

export function panelsForItemWarnings(
  returning?: BookingWarningRecord | null,
  booked?: BookingWarningRecord | null,
  dressLabel?: string,
): PdfWarningPanel[] {
  const panels: PdfWarningPanel[] = [];
  if (returning) panels.push({ variant: "returning", dressLabel, w: returning });
  if (booked) panels.push({ variant: "booked", dressLabel, w: booked });
  return panels;
}
