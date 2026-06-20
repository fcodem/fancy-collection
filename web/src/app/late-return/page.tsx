import Link from "next/link";
import prisma, { todayStartQ } from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { localTodayStart } from "@/lib/constants";

export default async function LateReturnPage() {
  const todayQ = todayStartQ();
  const today = localTodayStart();

  const bookings = await prisma.booking.findMany({
    where: { returnDate: { lt: todayQ }, status: "delivered" },
    include: { bookingItems: { include: { item: true } }, legacyItem: true },
    orderBy: { returnDate: "asc" },
  });

  return (
    <ServerAppShell>
      <div className="card">
        <div className="card-header"><h3 className="card-title" style={{ color: "var(--danger)" }}>Late Returns ({bookings.length})</h3></div>
        <div className="card-body p-0">
          {bookings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No late returns.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <StandardBookingTableHead />
                    <th>Days Late</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const daysLate = Math.floor((today.getTime() - b.returnDate.getTime()) / 86400000);
                    return (
                      <tr key={b.id}>
                        <td><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                        <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                        <td><span className="badge badge-overdue">{daysLate} days</span></td>
                        <td><Link href={`/return/${b.id}`} className="btn btn-sm btn-primary">Process Return</Link></td>
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
