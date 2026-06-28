import Link from "next/link";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import type { ReactNode } from "react";
import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import BookingPanelFilters from "@/components/BookingPanelFilters";
import { bookingPanelDateRange, parseBookingPanelFilters } from "@/lib/bookingPanelFilter";
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
import { recordBookingPdfHeaders, recordBookingPdfRow, flattenBookingPdfRows } from "@/lib/standardBookingPdfRows";
import {
  buildWarningMaps,
  dateSpanFromBookings,
  fetchWarningEdgeBookings,
  pdfWarningsForBooking,
} from "@/lib/bookingWarnings";
export const revalidate = 30;

const bookingPanelInclude = {
  bookingItems: {
    select: {
      itemId: true,
      dressName: true,
      category: true,
      size: true,
      notes: true,
      isDelivered: true,
    },
  },
  legacyItem: { select: { size: true, category: true } },
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

export default async function BookingPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const todayReal = localTodayStart();
  const todayStr = todayIso();
  const currentYear = Number(todayStr.slice(0, 4));
  const { year, month } = parseBookingPanelFilters(sp, currentYear);
  const { from: panelFrom, to: panelTo, label: panelLabel } = bookingPanelDateRange(year, month);
  const panelDeliveryWhere = await whereDeliveryInRange(panelFrom, panelTo);

  const yearBounds = await prisma.booking.aggregate({
    where: activeBookingWhere(),
    _min: { deliveryDate: true },
    _max: { deliveryDate: true },
  });
  const minYear = yearBounds._min.deliveryDate
    ? yearBounds._min.deliveryDate.getUTCFullYear()
    : currentYear - 2;
  const maxYear = yearBounds._max.deliveryDate
    ? yearBounds._max.deliveryDate.getUTCFullYear()
    : currentYear + 1;
  const yearOptions: number[] = [];
  for (let y = maxYear + 1; y >= minYear - 1; y--) yearOptions.push(y);

  const [deliveryTodayWhere, returnTodayWhere] = await Promise.all([
    whereDeliveryInRange(todayStr, todayStr),
    whereReturnInRange(todayStr, todayStr),
  ]);

  const [bookings, statusCounts, deliveringToday, returningToday] = await Promise.all([
      prisma.booking.findMany({
        where: { ...activeBookingWhere(), ...panelDeliveryWhere },
        include: bookingPanelInclude,
        orderBy: [{ deliveryDate: "asc" }, { monthlySerial: "asc" }],
      }),
      prisma.booking.groupBy({
        by: ["status"],
        where: activeBookingWhere(),
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

  const pdfHeaders = recordBookingPdfHeaders("Status");
  const span = dateSpanFromBookings(bookings);
  const edgeBookings = span.from ? await fetchWarningEdgeBookings(span.from, span.to) : [];
  const { returning: returningMap, booked: bookedMap } = buildWarningMaps(edgeBookings);
  const pdfResults = bookings.map((b) =>
    recordBookingPdfRow(
      b.monthlySerial,
      b,
      [resolveBookingStatus(b)],
      pdfWarningsForBooking(b, returningMap, bookedMap),
    ),
  );
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

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
        <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-list" style={{ marginRight: 8 }} />
            All Bookings
            <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>
              — {panelLabel}
            </span>
          </h3>
          {bookings.length > 0 && (
            <DownloadPdfButton
              title={`All Bookings — ${panelLabel}`}
              filename={`booking-panel-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}`}
              headers={pdfHeaders}
              rows={pdfRows}
              warningsBelow={warningsBelow}
              size="sm"
            />
          )}
        </div>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <BookingPanelFilters year={year} month={month} yearOptions={yearOptions.length ? yearOptions : [currentYear]} />
        </div>
        {bookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><i className="fa-solid fa-calendar-xmark" /></div>
            <h3>No bookings for {panelLabel}</h3>
            <p>Try another month or year, or create a new booking.</p>
            <a href="/booking/new" className="btn btn-primary mt-16"><i className="fa-solid fa-plus" /> New Booking</a>
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
                            <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm"><i className="fa-solid fa-eye" /></Link>
                            {status === "delivered" && (
                              <Link href={`/booking-delivery/${b.id}`} className="btn btn-outline btn-sm" title="Edit Delivered"><i className="fa-solid fa-pen" /></Link>
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
      </div>
    </ServerAppShell>
  );
}
