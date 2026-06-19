"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import {
  StandardBookingTableCells,
  StandardBookingTableHead,
} from "@/components/BookingDetailsColumns";
import { BookingNotesBlock } from "@/components/BookingNotesBlock";
import { formatDate } from "@/lib/constants";
import { filterStatListBookings } from "@/lib/dashboardStatListFilter";
import type { DashboardStatBookingRow, DashboardStatListType } from "@/lib/services/dashboardStatLists";
import { formatInr } from "@/lib/format";

type Props = {
  listType: DashboardStatListType;
  title: string;
  description: string;
  bookings: DashboardStatBookingRow[];
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
  bookings,
  categories,
  todayIso,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("");

  const filtered = useMemo(
    () => filterStatListBookings(bookings, appliedQuery, appliedCategory),
    [bookings, appliedQuery, appliedCategory]
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

  const hasFilters = Boolean(appliedQuery || appliedCategory);

  return (
    <div>
      <div className="page-banner" style={{ marginBottom: 20, background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", borderRadius: "var(--radius)", padding: "16px 22px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{description}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            {filtered.length} of {bookings.length} record{bookings.length === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}
          </div>
        </div>
        <Link href="/" className="btn btn-sm" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.35)" }}>
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />Dashboard
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: "14px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label className="form-label">Search (optional)</label>
              <DressNameSuggestInput
                type="text"
                className="form-control"
                placeholder="Customer, serial, phone, dress name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                data-skip-dress-suggest="true"
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
            Search and category filters are optional and work independently. Use both together to narrow results within this list only.
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
            <StandardTable rows={filtered} listType={listType} todayIso={todayIso} />
          )}
        </div>
      </div>
    </div>
  );
}

function StandardTable({
  rows,
  listType,
  todayIso,
}: {
  rows: DashboardStatBookingRow[];
  listType: DashboardStatListType;
  todayIso: string;
}) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>S.No</th>
            <StandardBookingTableHead />
            {listType === "total-orders" && <th>Status</th>}
            {(listType === "returning-today" || listType === "remaining-to-deliver") && <th>Remaining</th>}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => {
            const rem = b.totalRemaining || 0;
            return (
              <tr key={b.id}>
                <td><strong>{String(b.monthlySerial).padStart(2, "0")}</strong></td>
                <StandardBookingTableCells d={b} />
                {listType === "total-orders" && (
                  <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                )}
                {(listType === "returning-today" || listType === "remaining-to-deliver") && (
                  <td style={{ fontWeight: 700, color: rem > 0 ? "var(--danger)" : "var(--success)" }}>
                    {rem > 0 ? `₹${formatInr(rem)}` : "Paid ✓"}
                  </td>
                )}
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/booking/${b.id}`} className="btn btn-sm btn-outline" style={{ marginRight: 6 }}>View</Link>
                  {listType === "remaining-to-deliver" && b.status === "booked" && (
                    <Link href={`/booking-delivery/${b.id}`} className="btn btn-sm btn-primary">Deliver</Link>
                  )}
                  {listType === "returning-today" && b.status === "delivered" && (
                    <Link href={`/return/${b.id}`} className="btn btn-sm btn-primary">Return</Link>
                  )}
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
                <div style={{ fontWeight: 600, fontSize: 13 }}>{b.customer_name}</div>
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
                <Link href={`/booking/${b.id}`} className="btn btn-outline btn-sm">View</Link>
                <Link href={`/booking-delivery/${b.id}`} className="btn btn-primary btn-sm">
                  <i className="fa-solid fa-truck" /> Deliver
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
