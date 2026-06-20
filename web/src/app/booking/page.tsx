import Link from "next/link";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import {
  StandardBookingDetailsGrid,
  StandardBookingTableCells,
  StandardBookingTableHead,
} from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { localTodayStart } from "@/lib/constants";
import { todayStartQ, todayEndQ } from "@/lib/prisma";
import { formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function BookingPanelPage() {
  const todayReal = localTodayStart();
  const today = todayStartQ();
  const todayEnd = todayEndQ();

  const [bookings, totalCount, bookedCount, deliveredCount, returnedCount, deliveringToday, returningToday] =
    await Promise.all([
      prisma.booking.findMany({
        where: { status: { not: "cancelled" } },
        include: { bookingItems: { include: { item: true } }, legacyItem: true },
        orderBy: { monthlySerial: "desc" },
        take: 150,
      }),
      prisma.booking.count({ where: { status: { not: "cancelled" } } }),
      prisma.booking.count({ where: { status: "booked" } }),
      prisma.booking.count({ where: { status: "delivered" } }),
      prisma.booking.count({ where: { status: "returned" } }),
      prisma.booking.findMany({
        where: { status: "booked", deliveryDate: { gte: today, lt: todayEnd } },
        include: { bookingItems: { include: { item: true } }, legacyItem: true },
        orderBy: { deliveryTime: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ["booked", "delivered"] },
          returnDate: { gte: today, lt: todayEnd },
        },
        include: { bookingItems: { include: { item: true } }, legacyItem: true },
        orderBy: { returnTime: "asc" },
      }),
    ]);

  return (
    <ServerAppShell>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <a href="/booking/new" className="btn btn-primary">
          <i className="fa-solid fa-plus" /> New Booking
        </a>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card primary">
          <div className="stat-icon"><i className="fa-solid fa-calendar-plus" /></div>
          <div className="stat-value">{totalCount}</div>
          <div className="stat-label">Total Bookings</div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon"><i className="fa-solid fa-bookmark" /></div>
          <div className="stat-value">{bookedCount}</div>
          <div className="stat-label">Upcoming (Booked)</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-icon"><i className="fa-solid fa-truck" /></div>
          <div className="stat-value">{deliveredCount}</div>
          <div className="stat-label">Delivered (Out)</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon"><i className="fa-solid fa-circle-check" /></div>
          <div className="stat-value">{returnedCount}</div>
          <div className="stat-label">Returned</div>
        </div>
      </div>

      {(deliveringToday.length > 0 || returningToday.length > 0) && (
        <div className="two-col" style={{ marginBottom: 24 }}>
          {deliveringToday.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title" style={{ color: "var(--info)" }}>
                  <i className="fa-solid fa-truck-fast" style={{ marginRight: 8 }} />Delivering Today
                </h3>
                <span className="badge badge-active">{deliveringToday.length}</span>
              </div>
              <div className="card-body p-0">
                {deliveringToday.map((b) => (
                  <div key={b.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                      <div className="rental-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{b.customerName[0]?.toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <StandardBookingDetailsGrid d={serializeStandardBookingDetails(b)} />
                      </div>
                      <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm">View</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {returningToday.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title" style={{ color: "var(--warning)" }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 8 }} />Returns Due Today
                </h3>
                <span className="badge badge-gold">{returningToday.length}</span>
              </div>
              <div className="card-body p-0">
                {returningToday.map((b) => (
                  <div key={b.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                      <div className="rental-avatar" style={{ width: 36, height: 36, fontSize: 13, background: "linear-gradient(135deg,var(--gold-dark),var(--gold))" }}>{b.customerName[0]?.toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <StandardBookingDetailsGrid d={serializeStandardBookingDetails(b)} />
                      </div>
                      <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm">View</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><i className="fa-solid fa-list" style={{ marginRight: 8 }} />All Bookings</h3>
        </div>
        {bookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><i className="fa-solid fa-calendar-xmark" /></div>
            <h3>No bookings yet</h3>
            <p>Create your first booking to get started.</p>
            <a href="/booking/new" className="btn btn-primary mt-16"><i className="fa-solid fa-plus" /> New Booking</a>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <StandardBookingTableHead />
                  <th>Advance</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const rem = b.totalRemaining ?? b.remaining;
                  const overdue = b.status === "delivered" && fmtDate(b.returnDate) < fmtDate(todayReal);
                  return (
                    <tr key={b.id} style={overdue ? { background: "rgba(192,57,43,0.04)" } : undefined}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--primary-light))", color: "white", fontWeight: 700, fontSize: 12 }}>
                          {String(b.monthlySerial).padStart(2, "0")}
                        </span>
                      </td>
                      <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                      <td style={{ color: "var(--success)", fontWeight: 600 }}>₹{formatInr(b.totalAdvance || b.advance)}</td>
                      <td>
                        {rem > 0 ? (
                          <span style={{ fontWeight: 800, color: "var(--danger)" }}>₹{formatInr(rem)}</span>
                        ) : (
                          <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${b.status}`}>{b.status}</span>
                        {b.status === "delivered" && (
                          <span className="badge badge-success" style={{ marginLeft: 4, fontSize: 9 }}>DELIVERED</span>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm"><i className="fa-solid fa-eye" /></Link>
                        {b.status === "delivered" && (
                          <Link href={`/booking-delivery/${b.id}`} className="btn btn-outline btn-sm" title="Edit Delivered"><i className="fa-solid fa-pen" /></Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ServerAppShell>
  );
}
