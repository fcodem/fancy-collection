import Link from "next/link";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import ResolveButton from "@/components/ResolveButton";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { photoUrl } from "@/lib/photoUrl";
import { formatInr } from "@/lib/format";
import { formatDate } from "@/lib/constants";
import DownloadPdfButton from "@/components/DownloadPdfButton";

export default async function IncompleteReturnPage() {
  const bookings = await prisma.booking.findMany({
    where: { status: "incomplete_return" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { returnedAt: "desc" },
  });

  return (
    <ServerAppShell>
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
              tableId="incomplete-return-table"
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
              <table id="incomplete-return-table" className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <StandardBookingTableHead />
                    <th>Missing Notes</th>
                    <th>Photo</th>
                    <th>Security Held</th>
                    <th>Returned On</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{String(b.monthlySerial).padStart(2, "0")}</td>
                      <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                      <td style={{ maxWidth: 240, wordBreak: "break-word" }}>
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
                      <td style={{ fontWeight: 700, color: "var(--danger)" }}>₹{formatInr(b.securityHeld)}</td>
                      <td>{b.returnedAt ? formatDate(b.returnedAt, "display") : "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <ResolveButton bookingId={b.id} />
                          <Link href={`/return/${b.id}`} className="btn btn-sm btn-outline">View</Link>
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
    </ServerAppShell>
  );
}
