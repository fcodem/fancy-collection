import Link from "next/link";
import type { ReactNode } from "react";
import RealtimePageRefresher from "@/components/RealtimePageRefresher";
import BookingPanelFilters from "@/components/BookingPanelFilters";
import { bookingPanelDateRange, parseBookingPanelFilters } from "@/lib/bookingPanelFilter";
import {
  StandardBookingTableCells,
  StandardBookingTableHead,
} from "@/components/BookingDetailsColumns";
import { serializeStandardBookingDetails } from "@/lib/bookingDetails";
import { localTodayStart, todayIso } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { resolveBookingStatus } from "@/lib/bookingStatus";
import { bookingMonthKey, formatBookingMonthLabel } from "@/lib/bookingMonth";
import BookingPanelPdfButton from "@/components/BookingPanelPdfButton";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import {
  BOOKING_PANEL_PAGE_SIZE,
  loadBookingPanelPage,
} from "@/lib/services/bookingPanelData";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function BookingPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const todayReal = localTodayStart();
  const currentYear = Number(todayIso().slice(0, 4));
  const { year, month } = parseBookingPanelFilters(sp, currentYear);
  const { from: panelFrom, to: panelTo, label: panelLabel } = bookingPanelDateRange(year, month);
  const page = Math.max(1, Number(sp.page || "1") || 1);

  const { yearBounds, bookings, statusCounts, totalCount, pageSize, totalPages } =
    await loadBookingPanelPage({
      year,
      month,
      panelFrom,
      panelTo,
      page,
      pageSize: BOOKING_PANEL_PAGE_SIZE,
    });

  const minYear = yearBounds._min.deliveryDate
    ? yearBounds._min.deliveryDate.getUTCFullYear()
    : currentYear - 2;
  const maxYear = yearBounds._max.deliveryDate
    ? yearBounds._max.deliveryDate.getUTCFullYear()
    : currentYear + 1;
  const yearOptions: number[] = [];
  for (let y = maxYear + 1; y >= minYear - 1; y--) yearOptions.push(y);

  const countByStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r._count._all]));
  const bookedCount = countByStatus.booked || 0;
  const deliveredCount = countByStatus.delivered || 0;
  const returnedCount = countByStatus.returned || 0;

  const monthQs = month == null ? "all" : String(month);
  const prevHref =
    page > 1
      ? `/booking?year=${year}&month=${monthQs}&page=${page - 1}`
      : null;
  const nextHref =
    page < totalPages
      ? `/booking?year=${year}&month=${monthQs}&page=${page + 1}`
      : null;

  return (
    <>
      <RealtimePageRefresher />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        <BookingPanelPdfButton year={year} month={month} />
        <Link href="/booking/new" className="btn btn-primary" prefetch>
          <i className="fa-solid fa-plus" /> New Booking
        </Link>
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

      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-list" style={{ marginRight: 8 }} />
            All Bookings
            <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>
              — {panelLabel}
            </span>
          </h3>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
        </div>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <BookingPanelFilters year={year} month={month} yearOptions={yearOptions.length ? yearOptions : [currentYear]} />
        </div>
        {bookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><i className="fa-solid fa-calendar-xmark" /></div>
            <h3>No bookings for {panelLabel}</h3>
            <p>Try another month or year, or create a new booking.</p>
            <Link href="/booking/new" className="btn btn-primary mt-16"><i className="fa-solid fa-plus" /> New Booking</Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table id="booking-panel-table" className="data-table data-table--booking">
              <thead>
                <tr>
                  <th className="booking-col-serial">S.No</th>
                  <StandardBookingTableHead />
                  <th className="booking-col-money">Advance</th>
                  <th className="booking-col-money">Remaining</th>
                  <th className="booking-col-date">Status</th>
                  <th className="booking-col-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastMonth = "";
                  const rows: ReactNode[] = [];
                  for (const b of bookings) {
                    const monthKey = bookingMonthKey(b.deliveryDate);
                    if (monthKey !== lastMonth) {
                      lastMonth = monthKey;
                      rows.push(
                        <tr key={`month-${monthKey}`}>
                          <td
                            colSpan={15}
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
                            {formatBookingMonthLabel(b.deliveryDate)}
                          </td>
                        </tr>,
                      );
                    }
                    const status = resolveBookingStatus(b);
                    const rem = b.totalRemaining ?? b.remaining;
                    const overdue = status === "delivered" && fmtDate(b.returnDate) < fmtDate(todayReal);
                    rows.push(
                      <tr key={b.id} style={overdue ? { background: "rgba(192,57,43,0.04)" } : undefined}>
                        <td className="booking-col-serial">
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--primary-light))", color: "white", fontWeight: 700, fontSize: 12 }}>
                            {String(b.monthlySerial).padStart(2, "0")}
                          </span>
                        </td>
                        <StandardBookingTableCells d={serializeStandardBookingDetails(b)} />
                        <td className="booking-col-money" style={{ color: "var(--success)", fontWeight: 600 }}>₹{formatInr(b.totalAdvance || b.advance)}</td>
                        <td className="booking-col-money">
                          {rem > 0 ? (
                            <span style={{ fontWeight: 800, color: "var(--danger)" }}>₹{formatInr(rem)}</span>
                          ) : (
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>
                          )}
                        </td>
                        <td className="booking-col-date">
                          <span className={`badge badge-${status}`}>{status}</span>
                          {status === "delivered" && (
                            <span className="badge badge-success" style={{ marginLeft: 4, fontSize: 9 }}>DELIVERED</span>
                          )}
                        </td>
                        <td className="booking-col-actions">
                          <div className="booking-col-actions-inner">
                            <PrefetchOnIntentLink href={`/booking/${b.id}`} className="btn btn-outline btn-sm"><i className="fa-solid fa-eye" /></PrefetchOnIntentLink>
                            <PrefetchOnIntentLink href={`/jewellery-selection/${b.id}`} className="btn btn-outline btn-sm" title="Jewellery Selection" style={{ color: "#b8860b", borderColor: "#c9a84c" }}><i className="fa-solid fa-gem" /></PrefetchOnIntentLink>
                            {status === "delivered" && (
                              <PrefetchOnIntentLink href={`/booking-delivery/${b.id}`} className="btn btn-outline btn-sm" title="Edit Delivered"><i className="fa-solid fa-pen" /></PrefetchOnIntentLink>
                            )}
                          </div>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderTop: "1px solid var(--border, #e5e7eb)",
          }}
        >
          {prevHref ? (
            <Link href={prevHref} className="btn btn-outline btn-sm" prefetch>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Showing {bookings.length} of {totalCount} (max {pageSize}/page)
          </span>
          {nextHref ? (
            <Link href={nextHref} className="btn btn-outline btn-sm" prefetch>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </>
  );
}
