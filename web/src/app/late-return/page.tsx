import Link from "next/link";
import prisma from "@/lib/prisma";
import { whereReturnBefore } from "@/lib/bookingDateQuery";
import { todayIso } from "@/lib/constants";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { recordBookingPdfHeaders, recordBookingPdfRow, flattenBookingPdfRows } from "@/lib/standardBookingPdfRows";
import {
  buildWarningMaps,
  dateSpanFromBookings,
  fetchWarningEdgeBookings,
  pdfWarningsForBooking,
} from "@/lib/bookingWarnings";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { localTodayStart } from "@/lib/constants";

export default async function LateReturnPage() {
  const today = localTodayStart();
  const returnWhere = await whereReturnBefore(todayIso());

  const bookings = await prisma.booking.findMany({
    where: { ...returnWhere, status: "delivered" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { returnDate: "asc" },
  });

  const pdfHeaders = recordBookingPdfHeaders("Days Late");
  const span = dateSpanFromBookings(bookings);
  const edgeBookings = span.from ? await fetchWarningEdgeBookings(span.from, span.to) : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);
  const pdfResults = bookings.map((b) => {
    const daysLate = Math.floor((today.getTime() - b.returnDate.getTime()) / 86400000);
    return recordBookingPdfRow(
      b.monthlySerial,
      b,
      [`${daysLate} days`],
      pdfWarningsForBooking(b, returningMap, bookedMap),
    );
  });
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return (
    <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ color: "var(--danger)" }}>Late Returns ({bookings.length})</h3>
          {bookings.length > 0 && (
            <DownloadPdfButton
              title="Late Returns"
              filename="late-returns"
              headers={pdfHeaders}
              rows={pdfRows}
              warningsBelow={warningsBelow}
              size="sm"
            />
          )}
        </div>
        <div className="card-body p-0">
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No late returns.</div>
          ) : (
            <div className="table-wrapper">
              <table id="late-return-table" className="data-table data-table--booking">
                <thead>
                  <tr>
                    <th className="booking-col-serial">S.No</th>
                    <StandardBookingTableHead />
                    <th className="booking-col-date">Days Late</th>
                    <th className="booking-col-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const daysLate = Math.floor((today.getTime() - b.returnDate.getTime()) / 86400000);
                    return (
                      <tr key={b.id}>
                        <td className="booking-col-serial"><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                        <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                        <td className="booking-col-date"><span className="badge badge-overdue">{daysLate} days</span></td>
                        <td className="booking-col-actions"><Link href={`/return/${b.id}`} prefetch={false} className="btn btn-sm btn-primary">Process Return</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
  );
}
