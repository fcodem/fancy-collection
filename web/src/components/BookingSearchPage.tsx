"use client";

import { useCallback, useEffect, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";

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
  month: "Month search — booked & delivered only",
  date: "Showing bookings nearest to the selected date",
};

export default function BookingSearchPage({
  title,
  apiPath,
  detailHref,
  dateLabel = "Date",
  showRemaining = false,
  showStatus = false,
  showCategoryFilter = false,
  monthBased = false,
  hint,
  todayIso,
  categories,
}: {
  title: string;
  apiPath: string;
  detailHref: string;
  dateLabel?: string;
  showRemaining?: boolean;
  showStatus?: boolean;
  showCategoryFilter?: boolean;
  monthBased?: boolean;
  hint?: string;
  todayIso: string;
  categories?: Categories;
}) {
  const [searchDate, setSearchDate] = useState(todayIso);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [searchMode, setSearchMode] = useState("");
  const [loaded, setLoaded] = useState(false);

  const runSearch = useCallback(async () => {
    const params = new URLSearchParams({
      date: searchDate,
      q: query,
    });
    if (category) params.set("category", category);
    const res = await fetch(`${apiPath}?${params.toString()}`, { credentials: "same-origin" });
    const data = await res.json();
    if (Array.isArray(data)) {
      setRows(data);
      setSearchMode("");
    } else {
      setRows(Array.isArray(data.results) ? data.results : []);
      setSearchMode(data.mode || "");
    }
    setLoaded(true);
  }, [apiPath, searchDate, query, category]);

  // Date or category change: refresh list (nearest to date, or filtered by category).
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDate, category]);

  const colSpan = 10 + (showRemaining ? 1 : 0) + (showStatus ? 1 : 0);
  const defaultHint = monthBased
    ? "Pick a date to see bookings nearest to that date (booked & delivered). Optionally filter by category. Type in Search and click Search to show only matching records."
    : "Search by customer name, dress, phone, WhatsApp, or serial. Shows delivered & returned records. Customer name searches full lifetime; other fields search within the selected year.";

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
        </div>
        <div className="card-body">
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
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Search</label>
              <DressNameSuggestInput
                type="text"
                className="form-input"
                placeholder="Serial / customer / phone / dress…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                data-skip-dress-suggest="true"
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
                    {showRemaining && <th>Remaining</th>}
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
                            ₹{formatInr(Number((b.total_remaining || 0) - (b.remaining_collected || 0)))}
                          </td>
                        )}
                        <td>
                          <a href={detailHref.replace("{id}", String(b.id))} className="btn btn-sm btn-primary">
                            <i className="fa-solid fa-pen" /> Edit
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
