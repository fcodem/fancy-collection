import Link from "next/link";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";
import { localTodayStart } from "@/lib/constants";

export default async function RemainingToDeliverPage() {
  const today = localTodayStart();

  const bookings = await prisma.booking.findMany({
    where: { deliveryDate: { lte: today }, status: "booked" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],
  });

  return (
    <ServerAppShell>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Remaining to Deliver ({bookings.length})</h3></div>
        <div className="card-body p-0">
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>All deliveries are complete.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <StandardBookingTableHead />
                    <th>Remaining</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const rem = Math.max(0, (b.totalRemaining || b.remaining) - (b.remainingCollected || 0));
                    return (
                      <tr key={b.id}>
                        <td><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                        <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                        <td style={{ fontWeight: 700, color: rem > 0 ? "var(--danger)" : "var(--success)" }}>
                          {rem > 0 ? `₹${formatInr(rem)}` : "Paid ✓"}
                        </td>
                        <td><Link href={`/booking/${b.id}`} className="btn btn-sm btn-outline" style={{ marginRight: 6 }}>View</Link><Link href={`/booking-delivery/${b.id}`} className="btn btn-sm btn-primary">Deliver</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ServerAppShell>
  );
}
