"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookingNotesBlock } from "@/components/BookingNotesBlock";
import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import StarBookingBadge from "@/components/StarBookingBadge";

type BookingSide = {
  id: number;
  serial: number;
  customer_name: string;
  address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  total_rent: number;
  total_remaining: number;
  remaining_collected: number;
  balance_remaining: number;
  security_deposit: number;
  security_collected: number;
  item_notes: string;
  common_notes: string;
  is_star?: boolean;
  items: string[];
};

type AlternateRow = {
  id: number;
  returning: BookingSide;
  next: BookingSide | null;
  item_categories: string[];
  delivery_notes: string;
};

function displayDate(iso: string) {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  return formatDate(d, "display");
}

function serialLabel(n: number) {
  return String(n || 0).padStart(2, "0");
}

function mapSide(raw: Record<string, unknown>, items: string[]): BookingSide {
  const totalRemaining = Number(raw.total_remaining ?? 0);
  const remainingCollected = Number(raw.remaining_collected ?? 0);
  return {
    id: Number(raw.id),
    serial: Number(raw.serial ?? 0),
    customer_name: String(raw.customer_name || ""),
    address: String(raw.address || ""),
    contact_1: String(raw.contact_1 || ""),
    whatsapp_no: String(raw.whatsapp_no || ""),
    venue: String(raw.venue || ""),
    delivery_date: String(raw.delivery_date || ""),
    delivery_time: String(raw.delivery_time || ""),
    return_date: String(raw.return_date || ""),
    return_time: String(raw.return_time || ""),
    total_rent: Number(raw.total_rent ?? raw.total_price ?? 0),
    total_remaining: totalRemaining,
    remaining_collected: remainingCollected,
    balance_remaining: Number(raw.balance_remaining ?? Math.max(0, totalRemaining - remainingCollected)),
    security_deposit: Number(raw.security_deposit ?? 0),
    security_collected: Number(raw.security_collected ?? 0),
    item_notes: String(raw.item_notes || ""),
    common_notes: String(raw.common_notes || ""),
    is_star: Boolean(raw.is_star),
    items,
  };
}

function mapRow(raw: Record<string, unknown>): AlternateRow {
  const items = Array.isArray(raw.items) ? (raw.items as string[]) : [];
  const categories = Array.isArray(raw.item_categories) ? (raw.item_categories as string[]) : [];
  const next = raw.next_booking as Record<string, unknown> | null;

  const returning = mapSide(raw, items);
  let nextSide: BookingSide | null = null;
  if (next) {
    const nextItems = Array.isArray(next.items) ? (next.items as string[]) : [];
    nextSide = mapSide(next, nextItems);
  }

  return { id: returning.id, returning, next: nextSide, item_categories: categories, delivery_notes: String(raw.delivery_notes || "") };
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="alternate-booking-label">{label}</td>
      <td className="alternate-booking-value">{children}</td>
    </tr>
  );
}

function BalanceCell({ amount }: { amount: number }) {
  if (amount <= 0) {
    return <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>;
  }
  return <span style={{ color: "var(--danger)", fontWeight: 700 }}>₹{formatInr(amount)}</span>;
}

function CustomerRecordPanel({
  variant,
  side,
  deliveryNotes,
}: {
  variant: "return" | "deliver";
  side: BookingSide;
  deliveryNotes?: string;
}) {
  const isReturn = variant === "return";
  const viewHref = isReturn ? `/return/${side.id}` : `/booking/${side.id}`;

  return (
    <div className={isReturn ? "alternate-booking-return" : "alternate-booking-next"}>
      <div className={`alternate-booking-panel-head ${isReturn ? "alternate-booking-panel-head--return" : "alternate-booking-panel-head--next"}`}>
        <i className={`fa-solid ${isReturn ? "fa-rotate-left" : "fa-truck-fast"}`} />
        {isReturn ? "RETURNING CUSTOMER" : "DELIVERING TO (NEXT CUSTOMER)"}
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.85 }}>#{serialLabel(side.serial)}</span>
      </div>
      <div className="alternate-booking-panel-body">
        <table className="alternate-booking-table">
          <tbody>
            <DetailRow label="Customer Name">
              <strong style={{ display: "inline-flex", alignItems: "center" }}>
                {side.customer_name || "—"}
                {side.is_star && <StarBookingBadge />}
              </strong>
            </DetailRow>
            <DetailRow label="Dress(es)">
              {side.items.join(", ") || "—"}
            </DetailRow>
            <DetailRow label="Address">{side.address || "—"}</DetailRow>
            <DetailRow label="Contact No.">{side.contact_1 || "—"}</DetailRow>
            <DetailRow label="WhatsApp No.">
              {side.whatsapp_no ? (
                <span style={{ color: "#25D366" }}>
                  <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
                  {side.whatsapp_no}
                </span>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Venue">{side.venue || "—"}</DetailRow>
            <DetailRow label="Pickup Date & Time">
              {displayDate(side.delivery_date)}
              {side.delivery_time ? ` · ${side.delivery_time}` : ""}
            </DetailRow>
            <DetailRow label="Return Date & Time">
              {displayDate(side.return_date)}
              {side.return_time ? ` · ${side.return_time}` : ""}
            </DetailRow>
            <DetailRow label="Total Rent">
              <span className="alternate-booking-rent">₹{formatInr(side.total_rent)}</span>
            </DetailRow>
            <DetailRow label="Balance Remaining">
              <BalanceCell amount={side.balance_remaining} />
            </DetailRow>
            <DetailRow label="Security at Delivery">
              {side.security_collected > 0 ? (
                <span style={{ fontWeight: 600 }}>₹{formatInr(side.security_collected)}</span>
              ) : side.security_deposit > 0 ? (
                <span style={{ color: "var(--text-muted)" }}>
                  ₹{formatInr(side.security_deposit)} <span style={{ fontSize: 11 }}>(booked, not yet collected)</span>
                </span>
              ) : (
                "—"
              )}
            </DetailRow>
            {(side.item_notes || side.common_notes || deliveryNotes) && (
              <tr>
                <td className="alternate-booking-label" style={{ verticalAlign: "top", paddingTop: 10 }}>
                  Notes
                </td>
                <td className="alternate-booking-value" style={{ paddingTop: 8 }}>
                  {deliveryNotes && (
                    <div style={{ marginBottom: 8, padding: "6px 10px", background: "var(--info-bg, #e8f4fd)", borderRadius: 6, fontSize: 12 }}>
                      <strong>Delivery:</strong> {deliveryNotes}
                    </div>
                  )}
                  <BookingNotesBlock
                    itemNotes={side.item_notes}
                    commonNotes={side.common_notes}
                    compact
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="alternate-booking-actions">
          <Link
            href={viewHref}
            className={`btn btn-sm ${isReturn ? "btn-outline" : "btn-outline"}`}
          >
            <i className="fa-solid fa-eye" style={{ marginRight: 6 }} />
            View Record
          </Link>
          {!isReturn && (
            <Link href={`/booking-delivery/${side.id}`} className="btn btn-sm btn-primary">
              <i className="fa-solid fa-truck" style={{ marginRight: 6 }} />
              Deliver
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReturningTodayClient({
  today,
  categories,
}: {
  today: string;
  categories: string[];
}) {
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<AlternateRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    setLoaded(false);
    fetch(`/api/returning-today?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data.map((row) => mapRow(row as Record<string, unknown>)) : [];
        setRows(list);
        setLoaded(true);
      })
      .catch(() => {
        setRows([]);
        setLoaded(true);
      });
  }, [date]);

  useRealtimeRefresh(BOOKING_EVENTS, load);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!category) return rows;
    return rows.filter((r) => r.item_categories.includes(category));
  }, [rows, category]);

  const pdfHeaders = [
    "S.No",
    "Returning Customer",
    "Returning Dresses",
    "Returning Dress Notes",
    "Returning Common Note",
    "Returning Contact",
    "Return Date/Time",
    "Next Customer",
    "Next Dresses",
    "Next Dress Notes",
    "Next Common Note",
    "Next Contact",
    "Delivery Date/Time",
    "Delivery Notes",
  ];

  const pdfRows = useMemo(
    () =>
      filtered.map((r) => {
        const ret = r.returning;
        const nxt = r.next;
        return [
          serialLabel(ret.serial),
          ret.customer_name || "—",
          ret.items.join(", ") || "—",
          ret.item_notes || "—",
          ret.common_notes || "—",
          ret.contact_1 || "—",
          `${displayDate(ret.return_date)}${ret.return_time ? ` ${ret.return_time}` : ""}`,
          nxt?.customer_name || "—",
          nxt?.items.join(", ") || "—",
          nxt?.item_notes || "—",
          nxt?.common_notes || "—",
          nxt?.contact_1 || "—",
          nxt
            ? `${displayDate(nxt.delivery_date)}${nxt.delivery_time ? ` ${nxt.delivery_time}` : ""}`
            : "—",
          r.delivery_notes || "—",
        ];
      }),
    [filtered],
  );

  return (
    <div className="alternate-booking-page">
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 8 }} />
            Alternate Booking
          </h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Shows dresses that are <strong>returning</strong> from one customer and <strong>delivered</strong> to another customer on the <strong>same date</strong> (alternate handover). Regular returns with no same-day re-delivery are not listed here.
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-control"
                style={{ maxWidth: 200 }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Category (optional)</label>
              <select className="form-control" style={{ minWidth: 180 }} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <DownloadPdfButton
              title="Alternate Booking"
              filename={`alternate-booking-${date}`}
              subtitle={`Date: ${displayDate(date)}${category ? ` · Category: ${category}` : ""}`}
              headers={pdfHeaders}
              rows={pdfRows}
              disabled={!loaded || !pdfRows.length}
            />
          </div>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="alternate-booking-columns-legend no-print">
          <div className="alternate-booking-legend-left">
            <i className="fa-solid fa-rotate-left" /> Left — Returning on this date
          </div>
          <div className="alternate-booking-legend-right">
            <i className="fa-solid fa-truck-fast" /> Right — Delivering on this date
          </div>
        </div>
      )}

      {filtered.map((r) => (
          <div
            key={r.id}
            className="card alternate-booking-card"
            style={{ marginBottom: 20, borderLeft: "4px solid #f39c12" }}
          >
            <div className="alternate-booking-split">
              <CustomerRecordPanel variant="return" side={r.returning} deliveryNotes={r.delivery_notes} />
              {r.next && <CustomerRecordPanel variant="deliver" side={r.next} />}
            </div>
          </div>
        ))}

      {loaded && !filtered.length && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            <i className="fa-solid fa-calendar-xmark" style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 15 }}>
              {rows.length && category
                ? "No alternate handovers match the selected category."
                : "No alternate handovers on this date — no dress is both returning and being delivered to another customer."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
