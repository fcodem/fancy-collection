"use client";

import Link from "next/link";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import BookingSearchSuggestInput from "@/components/BookingSearchSuggestInput";
import {
  StandardBookingTableCells,
  StandardBookingTableHead,
} from "@/components/BookingDetailsColumns";
import { BookingNotesBlock } from "@/components/BookingNotesBlock";
import { formatDate } from "@/lib/constants";
import { filterStatListBookings } from "@/lib/dashboardStatListFilter";
import type { DashboardStatBookingRow, DashboardStatListType } from "@/lib/services/dashboardStatLists";
import { formatInr } from "@/lib/format";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import StarBookingBadge from "@/components/StarBookingBadge";
import {
  STANDARD_BOOKING_HEADERS,
  flattenBookingPdfRows,
  standardBookingPdfRow,
} from "@/lib/standardBookingPdfRows";
import { fetchJson } from "@/lib/fetchJson";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";

type Props = {
  listType: DashboardStatListType;
  title: string;
  description: string;
  initialBookings: DashboardStatBookingRow[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
  hasMore: boolean;
  categories: string[];
  todayIso: string;
};

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

export default function DashboardStatListClient({
  listType,
  title,
  description,
  initialBookings,
  initialTotal,
  initialPage,
  pageSize,
  hasMore: initialHasMore,
  categories,
  todayIso,
}: Props) {
  const [bookings, setBookings] = useState(initialBookings);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");

  const reloadAll = useCallback(async () => {
    try {
      const data = await fetchJson<{
        bookings: DashboardStatBookingRow[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
      }>(`/api/dashboard/stats/${listType}?page=1&pageSize=${pageSize}`, { dedupeMs: 0 });
      setBookings(data.bookings);
      setTotal(data.total);
      setPage(1);
      setHasMore(data.hasMore);
    } catch { /* ignore — user will see stale data until next poll */ }
  }, [listType, pageSize]);

  useRealtimeRefresh(BOOKING_EVENTS, reloadAll);

  const filtered = useMemo(
    () => filterStatListBookings(bookings, appliedQuery, appliedCategory),
    [bookings, appliedQuery, appliedCategory],
  );

  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setAppliedCategory(category);
  }, [category]);

  function applyFilters() {
    setAppliedQuery(query.trim());
    setAppliedCategory(category);
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setAppliedQuery("");
    setAppliedCategory("");
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const nextPage = page + 1;
      const data = await fetchJson<{
        bookings: DashboardStatBookingRow[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
      }>(`/api/dashboard/stats/${listType}?page=${nextPage}&pageSize=${pageSize}`, {
        dedupeMs: 0,
      });
      setBookings((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        const merged = [...prev];
        for (const row of data.bookings) {
          if (!seen.has(row.id)) merged.push(row);
        }
        return merged;
      });
      setTotal(data.total);
      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  const hasFilters = Boolean(appliedQuery || appliedCategory);

  const pdfHeaders = [
    ...STANDARD_BOOKING_HEADERS,
    ...(listType === "total-orders" ? ["Status"] : []),
  ];

  const pdfResults = filtered.map((b) =>
    standardBookingPdfRow(
      b.monthlySerial,
      {
        ...b,
        contact1: b.contact1,
        whatsapp_no: b.whatsappNo ?? undefined,
        total_advance: b.totalAdvance,
        total_remaining: b.totalRemaining,
        remaining_collected: b.remainingCollected,
      },
      listType === "total-orders" ? [b.status || "—"] : [],
      b.pdfWarningPanels.length ? b.pdfWarningPanels : undefined,
    ),
  );
  const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);

  return (
    <div>
      <div className="page-banner" style={{ marginBottom: 20, background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", borderRadius: "var(--radius)", padding: "16px 22px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{description}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            Showing {filtered.length} loaded
            {hasFilters ? " (filtered)" : ""}
            {" · "}
            {total} total
            {hasMore ? " · more available" : ""}
          </div>
        </div>
        <Link href="/" className="btn btn-sm" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.35)" }}>
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />Dashboard
        </Link>
        <DownloadPdfButton
          title={title}
          filename={listType}
          subtitle={`${description} (loaded page only)`}
          headers={pdfHeaders}
          rows={pdfRows}
          warningsBelow={warningsBelow}
          disabled={!pdfRows.length}
          className="btn btn-sm"
          size="sm"
          style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.35)" }}
        />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: "14px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label className="form-label">Search (optional)</label>
              <BookingSearchSuggestInput
                type="text"
                className="form-control"
                placeholder="Serial, customer, phone, or dress name…"
                value={query}
                searchDate={todayIso}
                mode="delivery"
                onChange={(e) => setQuery(e.target.value)}
                onSuggestSelect={(item) => {
                  const serial = String(item.serial).padStart(2, "0");
                  setQuery(serial);
                  setAppliedQuery(serial);
                }}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              />
            </div>
            <div>
              <label className="form-label">Category (optional)</label>
              <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={applyFilters}>
                <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 6 }} />Search
              </button>
              {hasFilters && (
                <button type="button" className="btn btn-outline" onClick={clearFilters}>Clear</button>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
            Filters apply to loaded rows. Use Load more to bring in additional bookings, then narrow within this list.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              {bookings.length === 0 ? "No records in this list." : "No records match your filters."}
            </div>
          ) : listType === "remaining-to-deliver" ? (
            <RemainingTable rows={filtered} todayIso={todayIso} />
          ) : (
            <StandardTable rows={filtered} listType={listType} />
          )}
        </div>
        {(hasMore || loadError) && (
          <div style={{ padding: 16, textAlign: "center", borderTop: "1px solid var(--border)" }}>
            {loadError && (
              <p style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{loadError}</p>
            )}
            {hasMore && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : `Load more (${bookings.length} of ${total})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StandardTable({
  rows,
  listType,
}: {
  rows: DashboardStatBookingRow[];
  listType: DashboardStatListType;
}) {
  return (
    <div className="table-wrapper">
      <table className="data-table data-table--booking">
        <thead>
          <tr>
            <th className="booking-col-serial">S.No</th>
            <StandardBookingTableHead />
            {listType === "total-orders" && <th className="booking-col-date">Status</th>}
            {(listType === "returning-today" || listType === "remaining-to-deliver") && (
              <th className="booking-col-money">Remaining</th>
            )}
            <th className="booking-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const rem = b.totalRemaining || 0;
            return (
              <tr key={b.id}>
                <td className="booking-col-serial"><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                <StandardBookingTableCells d={b} />
                {listType === "total-orders" && (
                  <td className="booking-col-date"><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                )}
                {(listType === "returning-today" || listType === "remaining-to-deliver") && (
                  <td className="booking-col-money" style={{ fontWeight: 700, color: rem > 0 ? "var(--danger)" : "var(--success)" }}>
                    {rem > 0 ? `₹${formatInr(rem)}` : "Paid ✓"}
                  </td>
                )}
                <td className="booking-col-actions">
                  <div className="booking-col-actions-inner">
                    <PrefetchOnIntentLink href={`/booking/${b.id}`} className="btn btn-sm btn-outline">View</PrefetchOnIntentLink>
                    {listType === "remaining-to-deliver" && b.status === "booked" && (
                      <PrefetchOnIntentLink href={`/booking-delivery/${b.id}`} className="btn btn-sm btn-primary">Deliver</PrefetchOnIntentLink>
                    )}
                    {listType === "returning-today" && b.status === "delivered" && (
                      <PrefetchOnIntentLink href={`/return/${b.id}`} className="btn btn-sm btn-primary">Return</PrefetchOnIntentLink>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RemainingTable({ rows, todayIso }: { rows: DashboardStatBookingRow[]; todayIso: string }) {
  return (
    <div>
      {rows.map((b, idx) => {
        const overdue = dateKey(b.deliveryDateIso) < todayIso;
        const showHeader =
          idx === 0 || dateKey(rows[idx - 1].deliveryDateIso) !== dateKey(b.deliveryDateIso);
        const rem = b.totalRemaining || 0;
        return (
          <div key={b.id}>
            {showHeader && (
              <div
                style={{
                  padding: "6px 20px",
                  fontSize: 11,
                  fontWeight: 700,
                  background: overdue ? "#7b2d2d33" : "#7b4a0033",
                  color: overdue ? "#fc8181" : "#fbd38d",
                }}
              >
                {overdue ? "OVERDUE" : "TODAY"} — {formatDate(b.deliveryDateIso, "display")}
              </div>
            )}
            <div
              className="list-row-flex"
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                borderLeft: overdue ? "3px solid #e53e3e" : undefined,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: overdue ? "#7b2d2d" : "var(--warning)",
                  color: overdue ? "#fc8181" : "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {String(b.monthlySerial).padStart(2, "0")}
              </span>
              <div className="list-row-main" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center" }}>
                  {b.customer_name}
                  {b.is_star && <StarBookingBadge />}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", wordBreak: "break-word" }}>
                  {b.dress_names} · {b.delivery_time}
                  {b.contact1 ? ` · ${b.contact1}` : ""}
                </div>
                <BookingNotesBlock itemNotes={b.item_notes} commonNotes={b.common_notes} compact />
              </div>
              {rem > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fc8181", flexShrink: 0 }}>₹{formatInr(rem)}</span>
              )}
              <div className="list-row-actions" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <PrefetchOnIntentLink href={`/booking/${b.id}`} className="btn btn-outline btn-sm">View</PrefetchOnIntentLink>
                <PrefetchOnIntentLink href={`/booking-delivery/${b.id}`} className="btn btn-primary btn-sm">
                  <i className="fa-solid fa-truck" /> Deliver
                </PrefetchOnIntentLink>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
