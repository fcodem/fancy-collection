"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BookingSearchSuggestInput from "@/components/BookingSearchSuggestInput";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { bookingListRecordFrom } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";
import { fetchJson } from "@/lib/fetchJson";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import StarBookingBadge from "@/components/StarBookingBadge";

type SearchRow = StandardBookingDetails & {
  id: number;
  serial: number;
  status?: string;
  total_advance?: number;
  is_star?: boolean;
};

type PostponedRow = ReturnType<typeof bookingListRecordFrom> & {
  id: number;
  serial: number;
  total_advance: number;
  postponed_at: string | null;
  is_star?: boolean;
};

export default function PostponedBookingClient({ todayIso: today }: { todayIso: string }) {
  const router = useRouter();
  const [searchQ, setSearchQ] = useState("");
  const [searchDate, setSearchDate] = useState(today);
  const [searchResults, setSearchResults] = useState<SearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [postponedQ, setPostponedQ] = useState("");
  const [postponedList, setPostponedList] = useState<PostponedRow[]>([]);
  const [totalHeld, setTotalHeld] = useState(0);
  const [postponedLoading, setPostponedLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const loadPostponed = useCallback(async (q?: string) => {
    setPostponedLoading(true);
    try {
      const params = new URLSearchParams();
      if (q?.trim()) params.set("q", q.trim());
      const data = await fetchJson<{ results: PostponedRow[]; total_advance_held: number }>(
        `/api/postponed-booking?${params}`,
      );
      setPostponedList(data.results || []);
      setTotalHeld(data.total_advance_held || 0);
    } catch {
      setPostponedList([]);
      setTotalHeld(0);
    } finally {
      setPostponedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPostponed();
  }, [loadPostponed]);

  useRealtimeRefresh(BOOKING_EVENTS, () => {
    void loadPostponed(postponedQ);
  });

  function openFromSuggestion(item: { id: number; serial: number }) {
    router.push(`/postponed-booking/${item.id}`);
  }

  async function runSearch() {
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ mode: "search", q: searchQ.trim(), date: searchDate });
      const data = await fetchJson<{ results: SearchRow[] }>(`/api/postponed-booking?${params}`);
      setSearchResults(data.results || []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function resolve(id: number, label: string) {
    if (!confirm(`Resolve and permanently remove postponed booking ${label}? This cannot be undone.`)) return;
    setActionBusy(id);
    setMessage("");
    try {
      await fetchJson("/api/postponed-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", booking_id: id }),
      });
      setMessage(`Postponed booking ${label} resolved and removed.`);
      await loadPostponed(postponedQ);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not resolve");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div>
      {message && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
          {message}
        </div>
      )}

      <div
        className="postponed-booking-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Left — search active bookings to postpone */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 8 }} />
              Search Booking to Postpone
            </h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
              Search booked records, open a record, then type POSTPONE on the detail page to mark it postponed.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <BookingSearchSuggestInput
                className="form-control"
                style={{ flex: "1 1 180px" }}
                placeholder="Serial, customer, phone, dress…"
                value={searchQ}
                searchDate={searchDate}
                mode="delivery"
                onChange={(e) => setSearchQ(e.target.value)}
                onSuggestSelect={(item) => openFromSuggestion(item)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              />
              <input
                type="date"
                className="form-control"
                style={{ flex: "0 1 160px" }}
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
              <button type="button" className="btn btn-primary" disabled={searchLoading} onClick={() => void runSearch()}>
                {searchLoading ? "Searching…" : "Search"}
              </button>
            </div>
            {searchError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{searchError}</div>}
            {searchResults.length === 0 && !searchLoading ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 24 }}>
                Search to find bookings that can be postponed.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Customer</th>
                      <th>Dress</th>
                      <th>Delivery</th>
                      <th>Advance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/postponed-booking/${row.id}`} style={{ fontWeight: 700, color: "var(--primary)" }}>
                            #{String(row.serial).padStart(2, "0")}
                          </Link>
                        </td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            {row.customer_name}
                            {row.is_star && <StarBookingBadge />}
                          </span>
                        </td>
                        <td style={{ maxWidth: 160, wordBreak: "break-word" }}>{row.dress_names}</td>
                        <td>{row.delivery_date} {row.delivery_time}</td>
                        <td>₹{formatInr(row.total_advance ?? 0)}</td>
                        <td>
                          <Link href={`/postponed-booking/${row.id}`} className="btn btn-sm btn-primary">
                            <i className="fa-solid fa-folder-open" style={{ marginRight: 4 }} />
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right — postponed records */}
        <div className="card" style={{ borderLeft: "4px solid #E65100" }}>
          <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
            <h3 className="card-title">
              <i className="fa-solid fa-clock" style={{ marginRight: 8, color: "#E65100" }} />
              Postponed Bookings
            </h3>
            <span className="badge badge-warning">{postponedList.length} record{postponedList.length === 1 ? "" : "s"}</span>
          </div>
          <div className="card-body">
            <div
              style={{
                marginBottom: 16,
                padding: "14px 18px",
                borderRadius: 10,
                background: "linear-gradient(135deg, rgba(230,81,0,0.12), rgba(201,168,70,0.08))",
                border: "2px solid #E65100",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
                TOTAL ADVANCE HELD (POSTPONED)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#E65100" }}>₹{formatInr(totalHeld)}</div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <BookingSearchSuggestInput
                type="search"
                className="form-control"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Search within postponed records…"
                value={postponedQ}
                mode="postponed"
                onChange={(e) => setPostponedQ(e.target.value)}
                onSuggestSelect={(item) => openFromSuggestion(item)}
                onKeyDown={(e) => e.key === "Enter" && void loadPostponed(postponedQ)}
              />
              <button type="button" className="btn btn-outline" disabled={postponedLoading} onClick={() => void loadPostponed(postponedQ)}>
                Search
              </button>
            </div>

            {postponedLoading ? (
              <p style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                <i className="fa-solid fa-spinner fa-spin" /> Loading…
              </p>
            ) : postponedList.length === 0 ? (
              <p style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>No postponed bookings.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {postponedList.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      border: "1.5px solid var(--border)",
                      borderRadius: 12,
                      padding: 14,
                      background: "rgba(230,81,0,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                      <div>
                        <Link href={`/postponed-booking/${row.id}`} style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>
                          #{String(row.serial).padStart(2, "0")} — {row.customer_name}
                          {row.is_star && <StarBookingBadge />}
                        </Link>
                        {row.postponed_at && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                            Postponed: {row.postponed_at}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          background: "rgba(230,81,0,0.15)",
                          border: "2px solid #E65100",
                          textAlign: "right",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#E65100" }}>ADVANCE HELD</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#E65100" }}>₹{formatInr(row.total_advance)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 12, color: "var(--text-muted)" }}>
                      <div><strong>Dress:</strong> {row.dress_names}</div>
                      <div><strong>Delivery:</strong> {row.delivery_date} {row.delivery_time}</div>
                      <div><strong>Return:</strong> {row.return_date} {row.return_time}</div>
                      {row.contact_1 && <div><strong>Contact:</strong> {row.contact_1}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link href={`/postponed-booking/${row.id}`} className="btn btn-sm btn-outline">
                        <i className="fa-solid fa-folder-open" style={{ marginRight: 4 }} />
                        Open
                      </Link>
                      <a
                        href={`/postponed-booking/${row.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-primary"
                      >
                        <i className="fa-solid fa-print" style={{ marginRight: 4 }} />
                        Postponed Slip
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                        disabled={actionBusy === row.id}
                        onClick={() => void resolve(row.id, `#${String(row.serial).padStart(2, "0")}`)}
                      >
                        <i className="fa-solid fa-check" style={{ marginRight: 4 }} />
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
