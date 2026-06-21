"use client";

import { useCallback, useEffect, useState } from "react";
import BookingSearchSuggestInput from "@/components/BookingSearchSuggestInput";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import {
  STANDARD_BOOKING_HEADERS,
  balanceRemainingLabel,
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
}) {
  const [searchDate, setSearchDate] = useState(todayIso);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [searchMode, setSearchMode] = useState("");
  const [searchMonth, setSearchMonth] = useState("");
  const [loaded, setLoaded] = useState(false);

  const runSearch = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        date: searchDate,
        q: query,
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
      } else {
        setRows(Array.isArray(data.results) ? data.results : []);
        setSearchMode(data.mode || "");
        setSearchMonth(typeof data.month === "string" ? data.month : "");
      }
      setLoaded(true);
    } catch {
      /* ignore transient network errors (e.g. dev recompile during poll refresh) */
      setLoaded((prev) => prev || true);
    }
  }, [apiPath, searchDate, query, category]);

  useRealtimeRefresh(BOOKING_EVENTS, runSearch);

  // Date or category change: refresh list (nearest to date, or filtered by category).
  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDate, category]);

  const colSpan = 10 + (showRemaining ? 1 : 0) + (showStatus ? 1 : 0) + (showDeliveryInfo ? 1 : 0);
  const suggestMode = apiPath.includes("return") ? "return" : "delivery";
  const defaultHint = monthBased
    ? "Pick any date in a month — booked and delivered records for that month appear below (returned records are hidden). Use Search to filter by customer, dress, phone, or serial."
    : "Search by customer name, dress, phone, WhatsApp, or serial. Includes booked, delivered, and returned records. Customer name searches full lifetime; other fields search within the selected year.";

  const pdfHeaders = [
    ...STANDARD_BOOKING_HEADERS,
    ...(showStatus ? ["Status"] : []),
    ...(showRemaining ? ["Balance Left"] : []),
    ...(showDeliveryInfo ? ["Delivery Info"] : []),
  ];

  const pdfRows = rows.map((b) => {
    const serial = b.serial_no ?? b.serial;
    const row = standardBookingPdfRow(serial, b);
    if (showStatus) row.push(b.status || "—");
    if (showRemaining) {
      row.push(
        balanceRemainingLabel(b.total_remaining, b.remaining_collected, b.balance_remaining),
      );
    }
    if (showDeliveryInfo) {
      const parts: string[] = [];
      if ((b.remaining_collected || 0) > 0) parts.push(`Collected: ₹${formatInr(b.remaining_collected || 0)}`);
      if ((b.security_held || b.security_collected || 0) > 0) {
        parts.push(`Security held: ₹${formatInr(b.security_held || b.security_collected || 0)}`);
      }
      if (b.delivery_notes) parts.push(b.delivery_notes);
      row.push(parts.length ? parts.join(" · ") : "—");
    }
    return row;
  });

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
                onSuggestSelect={() => runSearch()}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={runSearch}>
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
              {MODE_HINTS[searchMode]} · {rows.length} result{rows.length === 1 ? "" : "s"}
            </div>
          )}
          <div className="card-body p-0">
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <StandardBookingTableHead />
                    {showStatus && <th>Status</th>}
                    {showRemaining && <th>Balance Left</th>}
                    {showDeliveryInfo && <th>Delivery Info</th>}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{String(b.serial_no ?? b.serial).padStart(2, "0")}</strong>
                        </td>
                        <StandardBookingTableCells d={b} />
                        {showStatus && (
                          <td>
                            <span className={`badge badge-${b.status || "booked"}`}>
                              {b.status || "—"}
                            </span>
                          </td>
                        )}
                        {showRemaining && (
                          <td>
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
                          <td style={{ fontSize: 12, maxWidth: 220, wordBreak: "break-word" }}>
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
                        <td>
                          <a href={detailHref.replace("{id}", String(b.id))} className="btn btn-sm btn-primary">
                            <i className={`fa-solid ${actionIcon}`} /> {actionLabel}
                          </a>
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
          </div>
        </div>
      )}
    </div>
  );
}
