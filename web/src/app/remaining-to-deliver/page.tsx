import Link from "next/link";
import RealtimePageRefresher from "@/components/RealtimePageRefresher";
import prisma from "@/lib/prisma";
import {
  whereRemainingToDeliver,
} from "@/lib/bookingDateQuery";
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
import { formatInr } from "@/lib/format";

export default async function RemainingToDeliverPage() {
  const bookings = await prisma.booking.findMany({
    where: await whereRemainingToDeliver(todayIso()),
    include: {
      bookingItems: { include: { item: { select: { id: true, name: true, size: true, sku: true, category: true, photo: true, status: true } } } },
      legacyItem: true,
    },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
  });

  const pdfHeaders = recordBookingPdfHeaders();
  const span = dateSpanFromBookings(bookings);
  const edgeBookings = span.from ? await fetchWarningEdgeBookings(span.from, span.to) : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);
  const pdfResults = bookings.map((b) =>
    recordBookingPdfRow(b.monthlySerial, b, [], pdfWarningsForBooking(b, returningMap, bookedMap)),
  );
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return (
    <>
    <RealtimePageRefresher />
    <div className="card">
        <div className="card-header">
          <h3 className="card-title">Remaining to Deliver ({bookings.length})</h3>
          {bookings.length > 0 && (
            <DownloadPdfButton
              title="Remaining to Deliver"
              filename="remaining-to-deliver"
              headers={pdfHeaders}
              rows={pdfRows}
              warningsBelow={warningsBelow}
              size="sm"
            />
          )}
        </div>
        <div className="card-body p-0">
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>All deliveries are complete.</div>
          ) : (
            <div className="table-wrapper">
              <table id="remaining-to-deliver-table" className="data-table data-table--booking">
                <thead>
                  <tr>
                    <th className="booking-col-serial">S.No</th>
                    <StandardBookingTableHead />
                    <th className="booking-col-money">Remaining</th>
                    <th className="booking-col-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const rem = Math.max(0, (b.totalRemaining || b.remaining) - (b.remainingCollected || 0));
                    return (
                      <tr key={b.id}>
                        <td className="booking-col-serial"><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                        <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                        <td className="booking-col-money" style={{ fontWeight: 700, color: rem > 0 ? "var(--danger)" : "var(--success)" }}>
                          {rem > 0 ? `₹${formatInr(rem)}` : "Paid ✓"}
                        </td>
                        <td className="booking-col-actions">
                          <div className="booking-col-actions-inner">
                            <Link href={`/booking/${b.id}`} className="btn btn-sm btn-outline">View</Link>
                            <Link href={`/booking-delivery/${b.id}`} className="btn btn-sm btn-primary">Deliver</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
