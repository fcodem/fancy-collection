import Link from "next/link";
import type { ReactNode } from "react";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import {
  StandardBookingDetailsGrid,
  StandardBookingTableCells,
  StandardBookingTableHead,
} from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { localTodayStart, todayIso } from "@/lib/constants";
import {
  whereDeliveryInRange,
  whereReturnInRange,
} from "@/lib/bookingDateQuery";
import { formatInr } from "@/lib/format";
import { resolveBookingStatus } from "@/lib/bookingStatus";
import DownloadPdfButton from "@/components/DownloadPdfButton";
export const dynamic = "force-dynamic";

const bookingPanelInclude = {
  bookingItems: { select: { dressName: true, category: true, size: true, notes: true, isDelivered: true } },
  legacyItem: { select: { size: true } },
} as const;

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function deliveryMonthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDeliveryMonth(d: Date) {
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function BookingPanelPage() {
  const todayReal = localTodayStart();
  const todayStr = todayIso();
  const [deliveryTodayWhere, returnTodayWhere] = await Promise.all([
    whereDeliveryInRange(todayStr, todayStr),
    whereReturnInRange(todayStr, todayStr),
  ]);

  const [bookings, statusCounts, deliveringToday, returningToday] = await Promise.all([
      prisma.booking.findMany({
        where: { status: { not: "cancelled" } },
        include: bookingPanelInclude,
        orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
        take: 150,
      }),
      prisma.booking.groupBy({
        by: ["status"],
        where: { status: { not: "cancelled" } },
        _count: { _all: true },
      }),
      prisma.booking.findMany({
        where: { status: "booked", ...deliveryTodayWhere },
        include: bookingPanelInclude,
        orderBy: { deliveryTime: "asc" },
        take: 100,
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ["booked", "delivered"] },
          ...returnTodayWhere,
        },
        include: bookingPanelInclude,
        orderBy: { returnTime: "asc" },
        take: 100,
      }),
    ]);

  const countByStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r._count._all]));
  const totalCount = statusCounts.reduce((sum, r) => sum + r._count._all, 0);
  const bookedCount = countByStatus.booked || 0;
  const deliveredCount = countByStatus.delivered || 0;
  const returnedCount = countByStatus.returned || 0;

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
          {bookings.length > 0 && (
            <DownloadPdfButton
              title="All Bookings"
              filename="booking-panel"
              tableId="booking-panel-table"
              size="sm"
            />
          )}
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
            <table id="booking-panel-table" className="data-table">
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
                {(() => {
                  let lastMonth = "";
                  const rows: ReactNode[] = [];
                  for (const b of bookings) {
                    const monthKey = deliveryMonthKey(b.deliveryDate);
                    if (monthKey !== lastMonth) {
                      lastMonth = monthKey;
                      rows.push(
                        <tr key={`month-${monthKey}`}>
                          <td
                            colSpan={14}
                            style={{
                              background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
                              color: "white",
                              fontWeight: 700,
                              fontSize: 13,
                              padding: "10px 16px",
                              letterSpacing: 0.3,
                            }}
                          >
                            <i className="fa-solid fa-calendar" style={{ marginRight: 8 }} />
                            {formatDeliveryMonth(b.deliveryDate)}
                          </td>
                        </tr>,
                      );
                    }
                    const status = resolveBookingStatus(b);
                    const rem = b.totalRemaining ?? b.remaining;
                    const overdue = status === "delivered" && fmtDate(b.returnDate) < fmtDate(todayReal);
                    rows.push(
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
                          <span className={`badge badge-${status}`}>{status}</span>
                          {status === "delivered" && (
                            <span className="badge badge-success" style={{ marginLeft: 4, fontSize: 9 }}>DELIVERED</span>
                          )}
                        </td>
                        <td style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm"><i className="fa-solid fa-eye" /></Link>
                          {status === "delivered" && (
                            <Link href={`/booking-delivery/${b.id}`} className="btn btn-outline btn-sm" title="Edit Delivered"><i className="fa-solid fa-pen" /></Link>
                          )}
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ServerAppShell>
  );
}
