"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BookingSearchSuggestInput from "@/components/BookingSearchSuggestInput";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";
import { pdfCurrency } from "@/lib/pdfFormat";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { DEFAULT_SEARCH_PAGE_SIZE } from "@/lib/searchPagination";
import {
  STANDARD_BOOKING_HEADERS,
  flattenBookingPdfRows,
  standardBookingPdfRow,
} from "@/lib/standardBookingPdfRows";

type BookingRow = StandardBookingDetails & {
  id: number;
  serial: number;
  serial_no?: number;
  contact_1?: string;
  whatsapp_no?: string;
  venue?: string;
  total_price?: number;
  total_advance?: number;
  total_remaining?: number;
  remaining_collected?: number;
  security_collected?: number;
  security_held?: number;
  delivery_notes?: string;
  balance_remaining?: number;
  status?: string;
};

type Categories = {
  mens_categories: string[];
  womens_categories: string[];
  jewellery_categories: string[];
  accessory_categories: string[];
};

const MODE_HINTS: Record<string, string> = {
  serial: "Serial number match — sorted nearest to selected date",
  customer: "Customer name match — sorted nearest to selected date",
  phone: "Phone / WhatsApp match — sorted nearest to selected date",
  dress: "Dress name match — sorted nearest to selected date",
  mixed: "Combined matches — sorted nearest to selected date",
  year: "All records in selected year",
  month: "Booked & delivered only for the selected month — sorted by serial",
  date: "Showing bookings nearest to the selected date",
};

export default function BookingSearchPage({
  title,
  apiPath,
  detailHref,
  dateLabel = "Date",
  showRemaining = false,
  showStatus = false,
  showDeliveryInfo = false,
  showCategoryFilter = false,
  monthBased = false,
  hint,
  todayIso,
  categories,
  actionLabel = "Edit",
  actionIcon = "fa-pen",
  showRecordActions = false,
}: {
  title: string;
  apiPath: string;
  detailHref: string;
  dateLabel?: string;
  showRemaining?: boolean;
  showStatus?: boolean;
  showDeliveryInfo?: boolean;
  showCategoryFilter?: boolean;
  monthBased?: boolean;
  hint?: string;
  todayIso: string;
  categories?: Categories;
  actionLabel?: string;
  actionIcon?: string;
  /** View + Deliver/Return buttons (Search Booking) */
  showRecordActions?: boolean;
}) {
  const [searchDate, setSearchDate] = useState(todayIso);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [searchMode, setSearchMode] = useState("");
  const [searchMonth, setSearchMonth] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_SEARCH_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const runSearch = useCallback(async (pageOverride?: number) => {
    const activePage = pageOverride ?? page;
    try {
      const params = new URLSearchParams({
        date: searchDate,
        q: query,
        page: String(activePage),
        pageSize: String(pageSize),
      });
      if (category) params.set("category", category);
      const res = await fetch(`${apiPath}?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setRows(data);
        setSearchMode("");
        setSearchMonth("");
        setTotal(data.length);
        setHasMore(false);
      } else {
        setRows(Array.isArray(data.results) ? data.results : []);
        setSearchMode(data.mode || "");
        setSearchMonth(typeof data.month === "string" ? data.month : "");
        setTotal(typeof data.total === "number" ? data.total : (data.results?.length ?? 0));
        setHasMore(Boolean(data.hasMore));
        if (typeof data.page === "number") setPage(data.page);
        if (typeof data.pageSize === "number") setPageSize(data.pageSize);
      }
      setLoaded(true);
    } catch {
      /* ignore transient network errors (e.g. dev recompile during poll refresh) */
      setLoaded((prev) => prev || true);
    }
  }, [apiPath, searchDate, query, category, page, pageSize]);

  useRealtimeRefresh(BOOKING_EVENTS, () => runSearch());

  // Date or category change: refresh list from page 1.
  useEffect(() => {
    setPage(1);
    void runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDate, category, pageSize]);

  function handleSearchClick() {
    setPage(1);
    void runSearch(1);
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1) return;
    setPage(nextPage);
    void runSearch(nextPage);
  }

  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);

  const colSpan = 10 + (showRemaining ? 1 : 0) + (showStatus ? 1 : 0) + (showDeliveryInfo ? 1 : 0);
  const suggestMode = apiPath.includes("return") ? "return" : "delivery";
  const defaultHint = monthBased
    ? "Pick any date in a month — booked and delivered records for that month appear below (returned records are hidden). Use Search to filter by customer, dress, phone, or serial. Large lists are paginated — use Next/Previous at the bottom."
    : "Search by customer name, dress, phone, WhatsApp, or serial. Includes booked, delivered, and returned records. Customer name searches full lifetime; other fields search within the selected year. Results are paginated for large datasets.";

  const pdfHeaders = [
    ...STANDARD_BOOKING_HEADERS,
    ...(showStatus ? ["Status"] : []),
    ...(showDeliveryInfo ? ["Delivery Info"] : []),
  ];

  const pdfResults = rows.map((b) => {
    const serial = b.serial_no ?? b.serial;
    const result = standardBookingPdfRow(serial, {
      ...b,
      contact_1: b.contact_1,
      whatsapp_no: b.whatsapp_no,
      total_advance: b.total_advance,
      total_remaining: b.total_remaining,
      remaining_collected: b.remaining_collected,
    });
    if (showStatus) result.cells.push(b.status || "—");
    if (showDeliveryInfo) {
      const parts: string[] = [];
      if ((b.remaining_collected || 0) > 0) parts.push(`Collected: ${pdfCurrency(b.remaining_collected || 0)}`);
      if ((b.security_held || b.security_collected || 0) > 0) {
        parts.push(`Security held: ${pdfCurrency(b.security_held || b.security_collected || 0)}`);
      }
      if (b.delivery_notes) parts.push(b.delivery_notes);
      result.cells.push(parts.length ? parts.join(" · ") : "—");
    }
    return result;
  });
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return (
    <div>
      <div className="card" style={{ marginBottom: 24, overflow: "visible" }}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
          <DownloadPdfButton
            title={title}
            filename={title.toLowerCase().replace(/\s+/g, "-")}
            subtitle={`${dateLabel}: ${searchDate}${query ? ` · Search: ${query}` : ""}`}
            headers={pdfHeaders}
            rows={pdfRows}
            warningsBelow={warningsBelow}
            disabled={!loaded || !pdfRows.length}
            size="sm"
          />
        </div>
        <div className="card-body" style={{ overflow: "visible" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            {hint || defaultHint}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: showCategoryFilter
                ? "minmax(140px, 1fr) minmax(140px, 1fr) minmax(200px, 2fr) auto"
                : "minmax(140px, 1fr) minmax(200px, 2fr) auto",
              gap: 16,
              alignItems: "end",
            }}
          >
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>{dateLabel}</label>
              <input
                type="date"
                className="form-input"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
            </div>
            {showCategoryFilter && categories && (
              <div>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Category (optional)</label>
                <select
                  className="form-control"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="">All Categories</option>
                  <optgroup label="Men's">
                    {categories.mens_categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Women's">
                    {categories.womens_categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Jewellery">
                    {categories.jewellery_categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Accessories">
                    {categories.accessory_categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}
            <div style={{ position: "relative", zIndex: 20, overflow: "visible" }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Search</label>
              <BookingSearchSuggestInput
                type="text"
                className="form-input"
                placeholder="Serial / customer / phone / dress…"
                value={query}
                searchDate={searchDate}
                mode={suggestMode}
                onChange={(e) => setQuery(e.target.value)}
                onSuggestSelect={() => handleSearchClick()}
                onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={handleSearchClick}>
              <i className="fa-solid fa-search" /> Search
            </button>
          </div>
        </div>
      </div>

      {loaded && (
        <div className="card">
          {searchMode && MODE_HINTS[searchMode] && (
            <div
              style={{
                padding: "10px 16px",
                fontSize: 12,
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                background: "var(--cream-dark)",
              }}
            >
              {searchMode === "month" && searchMonth
                ? `Delivery month: ${new Date(`${searchMonth}-15T00:00:00.000Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} · `
                : ""}
              {MODE_HINTS[searchMode]} · {total.toLocaleString()} result{total === 1 ? "" : "s"}
              {total > 0 ? ` · showing ${pageStart.toLocaleString()}–${pageEnd.toLocaleString()}` : ""}
            </div>
          )}
          <div className="card-body p-0">
            <div className="table-wrapper">
              <table className="data-table data-table--booking">
                <thead>
                  <tr>
                    <th className="booking-col-serial">S.No</th>
                    <StandardBookingTableHead />
                    {showStatus && <th className="booking-col-date">Status</th>}
                    {showRemaining && <th className="booking-col-money">Balance Left</th>}
                    {showDeliveryInfo && <th className="booking-col-notes">Delivery Info</th>}
                    <th className="booking-col-actions">{showRecordActions ? "Actions" : "Action"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((b) => (
                      <tr key={b.id}>
                        <td className="booking-col-serial">
                          <strong>{String(b.serial_no ?? b.serial).padStart(2, "0")}</strong>
                        </td>
                        <StandardBookingTableCells d={b} />
                        {showStatus && (
                          <td className="booking-col-date">
                            <span className={`badge badge-${b.status || "booked"}`}>
                              {b.status || "—"}
                            </span>
                          </td>
                        )}
                        {showRemaining && (
                          <td className="booking-col-money">
                            {(() => {
                              const left =
                                b.balance_remaining ??
                                Math.max(0, (b.total_remaining || 0) - (b.remaining_collected || 0));
                              return left > 0 ? (
                                <span style={{ fontWeight: 700, color: "var(--danger)" }}>₹{formatInr(left)}</span>
                              ) : (
                                <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>
                              );
                            })()}
                          </td>
                        )}
                        {showDeliveryInfo && (
                          <td className="booking-col-notes" style={{ fontSize: 12 }}>
                            {(b.remaining_collected || 0) > 0 && (
                              <div>Collected: ₹{formatInr(b.remaining_collected || 0)}</div>
                            )}
                            {(b.security_held || b.security_collected || 0) > 0 && (
                              <div>
                                Security held: ₹{formatInr(b.security_held || b.security_collected || 0)}
                              </div>
                            )}
                            {b.delivery_notes ? (
                              <div style={{ color: "var(--text-muted)", marginTop: 4 }}>{b.delivery_notes}</div>
                            ) : (
                              !(b.remaining_collected || b.security_collected || b.security_held) && "—"
                            )}
                          </td>
                        )}
                        <td className="booking-col-actions">
                          {showRecordActions ? (
                            <div className="booking-col-actions-inner">
                              <Link href={`/booking/${b.id}`} className="btn btn-sm btn-outline">
                                <i className="fa-solid fa-eye" /> View
                              </Link>
                              {b.status === "booked" && (
                                <Link href={`/booking-delivery/${b.id}`} className="btn btn-sm btn-primary">
                                  <i className="fa-solid fa-truck-fast" /> Deliver
                                </Link>
                              )}
                              {b.status === "delivered" && (
                                <Link href={`/return/${b.id}`} className="btn btn-sm btn-primary">
                                  <i className="fa-solid fa-rotate-left" /> Return
                                </Link>
                              )}
                            </div>
                          ) : (
                            <a href={detailHref.replace("{id}", String(b.id))} className="btn btn-sm btn-primary">
                              <i className={`fa-solid ${actionIcon}`} /> {actionLabel}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={colSpan} style={{ textAlign: "center", padding: 20 }}>
                        No bookings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {total > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border)",
                  background: "var(--cream-dark)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Page {page} · {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Per page
                    <select
                      className="form-control"
                      style={{ marginLeft: 8, width: 80, display: "inline-block", padding: "4px 8px" }}
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    disabled={!hasMore}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
