import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";
import { bookingPanelDateRange, parseBookingPanelFilters } from "@/lib/bookingPanelFilter";
import { todayIso } from "@/lib/constants";
import { resolveBookingStatus } from "@/lib/bookingStatus";
import {
  recordBookingPdfHeaders,
  recordBookingPdfRow,
  flattenBookingPdfRows,
} from "@/lib/standardBookingPdfRows";
import { buildWarningMaps, pdfWarningsForBooking } from "@/lib/bookingWarnings";
import { loadBookingPanelForPdf } from "@/lib/services/bookingPanelData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Full-panel PDF payload — not built during normal Booking Panel page render. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const currentYear = Number(todayIso().slice(0, 4));
  const { year, month } = parseBookingPanelFilters(sp, currentYear);
  const { from: panelFrom, to: panelTo, label: panelLabel } = bookingPanelDateRange(year, month);

  const bookings = await loadBookingPanelForPdf({ panelFrom, panelTo });
  const pdfHeaders = recordBookingPdfHeaders("Status");
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(bookings);
  const pdfResults = bookings.map((b) =>
    recordBookingPdfRow(
      b.monthlySerial,
      b,
      [resolveBookingStatus(b)],
      pdfWarningsForBooking(b, returningMap, bookedMap),
    ),
  );
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return jsonOk({
    title: `All Bookings — ${panelLabel}`,
    filename: `booking-panel-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}`,
    headers: pdfHeaders,
    rows: pdfRows,
    warningsBelow,
  });
}
