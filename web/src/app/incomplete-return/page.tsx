import Link from "next/link";
import prisma from "@/lib/prisma";
import ResolveButton from "@/components/ResolveButton";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails, incompleteReturnSecuritySummary } from "@/lib/bookingDetails";
import IncompleteSecuritySummaryBox from "@/components/IncompleteSecuritySummaryBox";
import { photoUrl } from "@/lib/photoUrl";
import { pdfCurrency } from "@/lib/pdfFormat";
import { formatDate } from "@/lib/constants";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { recordBookingPdfHeaders, recordBookingPdfRow, flattenBookingPdfRows } from "@/lib/standardBookingPdfRows";
import {
  buildWarningMaps,
  pdfWarningsForBooking,
} from "@/lib/bookingWarnings";

function incompleteMissingNotes(
  b: {
    bookingItems: Array<{ isIncompleteReturn: boolean; dressName: string; itemIncompleteNotes: string | null }>;
    incompleteNotes: string | null;
  },
): string {
  if (b.bookingItems.some((bi) => bi.isIncompleteReturn)) {
    return b.bookingItems
      .filter((bi) => bi.isIncompleteReturn)
      .map((bi) => `${bi.dressName}: ${bi.itemIncompleteNotes || "—"}`)
      .join("; ");
  }
  return b.incompleteNotes || "—";
}

export default async function IncompleteReturnPage() {
  const bookings = await prisma.booking.findMany({
    where: { status: "incomplete_return" },
    select: {
      id: true,
      monthlySerial: true,
      publicBookingId: true,
      customerName: true,
      contact1: true,
      whatsappNo: true,
      deliveryDate: true,
      deliveryTime: true,
      returnDate: true,
      returnTime: true,
      returnedAt: true,
      venue: true,
      status: true,
      totalPrice: true,
      totalAdvance: true,
      totalRemaining: true,
      securityDeposit: true,
      securityHeld: true,
      securityCollected: true,
      incompleteNotes: true,
      incompletePhoto: true,
      bookingItems: {
        select: {
          id: true,
          itemId: true,
          dressName: true,
          category: true,
          size: true,
          isIncompleteReturn: true,
          itemIncompleteNotes: true,
          itemIncompletePhoto: true,
          itemSecurityHeld: true,
          isReturned: true,
          isDelivered: true,
          isCancelled: true,
        },
      },
      legacyItem: { select: { size: true, category: true } },
    },
    orderBy: { returnedAt: "desc" },
    take: 100,
  });

  const pdfHeaders = recordBookingPdfHeaders("Missing Notes", "Total Security", "Security Returned", "Security Held", "Returned On");
  // Build warnings from the already-loaded incomplete set — avoid a second heavy findMany.
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(bookings);
  const pdfResults = bookings.map((b) => {
    const security = incompleteReturnSecuritySummary({
      securityHeld: b.securityHeld,
      securityCollected: b.securityCollected,
      securityDeposit: b.securityDeposit,
      items: b.bookingItems,
    });
    return recordBookingPdfRow(
      b.monthlySerial,
      b,
      [
        incompleteMissingNotes(b),
        pdfCurrency(security.totalSecurity),
        pdfCurrency(security.securityReturned),
        pdfCurrency(security.securityHeld),
        b.returnedAt ? formatDate(b.returnedAt, "display") : "—",
      ],
      pdfWarningsForBooking(b, returningMap, bookedMap),
    );
  });
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return (
    <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 8, color: "#f39c12" }} />
            Incomplete Return Records
          </h3>
          {bookings.length > 0 && (
            <DownloadPdfButton
              title="Incomplete Return Records"
              filename="incomplete-returns"
              headers={pdfHeaders}
              rows={pdfRows}
              warningsBelow={warningsBelow}
              size="sm"
            />
          )}
        </div>
        <div className="card-body p-0">
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <i className="fa-solid fa-check-circle" style={{ fontSize: 48, marginBottom: 12, color: "var(--success)" }} />
              <p>No incomplete returns! All items accounted for.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table id="incomplete-return-table" className="data-table data-table--booking">
                <thead>
                  <tr>
                    <th className="booking-col-serial">S.No</th>
                    <StandardBookingTableHead />
                    <th className="booking-col-notes">Missing Notes</th>
                    <th className="booking-col-actions">Photo</th>
                    <th className="booking-col-money">Security</th>
                    <th className="booking-col-date">Returned On</th>
                    <th className="booking-col-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="booking-col-serial">{String(b.monthlySerial).padStart(2, "0")}</td>
                      <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                      <td className="booking-col-notes" style={{ maxWidth: 240 }}>
                        {b.bookingItems.some((bi) => bi.isIncompleteReturn) ? (
                          b.bookingItems
                            .filter((bi) => bi.isIncompleteReturn)
                            .map((bi) => (
                              <div key={bi.id} style={{ marginBottom: 6, fontSize: 13 }}>
                                <strong>{bi.dressName}:</strong> {bi.itemIncompleteNotes || "—"}
                              </div>
                            ))
                        ) : (
                          b.incompleteNotes || "—"
                        )}
                      </td>
                      <td>
                        {b.bookingItems.some((bi) => bi.itemIncompletePhoto) ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {b.bookingItems
                              .filter((bi) => bi.itemIncompletePhoto)
                              .map((bi) => (
                                <a key={bi.id} href={photoUrl(bi.itemIncompletePhoto!)} target="_blank" rel="noreferrer" title={bi.dressName}>
                                  <img
                                    src={photoUrl(bi.itemIncompletePhoto!)}
                                    alt={bi.dressName}
                                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                                  />
                                </a>
                              ))}
                          </div>
                        ) : b.incompletePhoto ? (
                          <a href={photoUrl(b.incompletePhoto)} target="_blank" rel="noreferrer">
                            <img
                              src={photoUrl(b.incompletePhoto)}
                              alt="Incomplete"
                              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                            />
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td className="booking-col-money" style={{ minWidth: 200 }}>
                        <IncompleteSecuritySummaryBox
                          compact
                          summary={incompleteReturnSecuritySummary({
                            securityHeld: b.securityHeld,
                            securityCollected: b.securityCollected,
                            securityDeposit: b.securityDeposit,
                            items: b.bookingItems,
                          })}
                        />
                      </td>
                      <td>{b.returnedAt ? formatDate(b.returnedAt, "display") : "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Link href={`/booking/${b.id}/incomplete-slip`} prefetch={false} className="btn btn-sm btn-outline" style={{ color: "#c2410c", borderColor: "#f39c12" }}>
                            <i className="fa-solid fa-receipt" style={{ marginRight: 4 }} />Slip
                          </Link>
                          <ResolveButton bookingId={b.id} />
                          <Link href={`/return/${b.id}`} prefetch={false} className="btn btn-sm btn-outline">View</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
  );
}
