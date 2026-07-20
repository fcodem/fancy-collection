import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { loadLateReturnExport } from "@/lib/services/lateReturnData";
import { recordBookingPdfHeaders, recordBookingPdfRow, flattenBookingPdfRows } from "@/lib/standardBookingPdfRows";
import {
  buildWarningMaps,
  fetchWarningBoundaryBookings,
  pdfWarningsForBooking,
} from "@/lib/bookingWarnings";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const rows = await loadLateReturnExport();
  const itemIds = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.booking.itemId ? [r.booking.itemId] : []),
        ...r.booking.bookingItems.map((bi) => bi.itemId).filter((id): id is number => id != null),
      ]),
    ),
  ];

  const edgeBookings =
    itemIds.length && rows.length
      ? await fetchWarningBoundaryBookings(
          rows[0].deliveryIso,
          rows[rows.length - 1].returnIso,
          itemIds,
          -1,
        )
      : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);

  const pdfHeaders = recordBookingPdfHeaders("Days Late");
  const pdfResults = rows.map((r) =>
    recordBookingPdfRow(
      r.booking.monthlySerial,
      r.booking,
      [`${r.daysLate} days`],
      pdfWarningsForBooking(r.booking, returningMap, bookedMap),
    ),
  );
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return jsonOk({
    headers: pdfHeaders,
    rows: pdfRows,
    warningsBelow,
    truncated: rows.length >= 500,
  });
}
