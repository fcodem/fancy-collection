"use client";

import Link from "next/link";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import StarBookingBadge from "@/components/StarBookingBadge";
import { formatDate } from "@/lib/constants";
import type { TomorrowPackingBooking, TomorrowPackingPageData } from "@/lib/services/tomorrowPacking";

function BookingCard({ booking, tone }: { booking: TomorrowPackingBooking; tone: "left" | "done" }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3 className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0 }}>
          <PrefetchOnIntentLink href={`/booking/${booking.id}`}>
            #{String(booking.serialNo).padStart(2, "0")} — {booking.customerName}
          </PrefetchOnIntentLink>
          {booking.isStar ? <StarBookingBadge /> : null}
        </h3>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Del {formatDate(booking.deliveryDate, "display")} · {booking.deliveryTime}
          {booking.returnDate
            ? ` · Ret ${formatDate(booking.returnDate, "display")} · ${booking.returnTime}`
            : ""}
        </div>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 8 }}>
        {booking.contact1 || booking.venue ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {booking.contact1 ? <span>{booking.contact1}</span> : null}
            {booking.contact1 && booking.venue ? " · " : null}
            {booking.venue ? <span>{booking.venue}</span> : null}
          </div>
        ) : null}
        {booking.commonNotes?.trim() ? (
          <div style={{ fontSize: 13 }}>
            <strong>Notes:</strong> {booking.commonNotes.trim()}
          </div>
        ) : null}
        {booking.items.map((item, idx) => (
          <div
            key={item.biId ?? `legacy-${idx}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: item.isPackedReady
                ? "rgba(104, 211, 145, 0.08)"
                : tone === "left"
                  ? "rgba(252, 129, 129, 0.08)"
                  : "var(--bg)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong>{item.displayName || item.dressName}</strong>
              {item.category ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.category}</div>
              ) : null}
              {item.packingNote?.trim() ? (
                <div style={{ fontSize: 12, marginTop: 4 }}>Note: {item.packingNote.trim()}</div>
              ) : null}
            </div>
            <div style={{ fontSize: 12, textAlign: "right", color: "var(--text-muted)" }}>
              <div style={{ color: item.isPackedReady ? "#2f855a" : "#c53030", fontWeight: 600 }}>
                {item.isPackedReady ? "Packed" : "Pending"}
              </div>
              {item.preparedBy ? <div>Prep: {item.preparedBy}</div> : null}
              {item.checkedBy ? <div>Check: {item.checkedBy}</div> : null}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PrefetchOnIntentLink href={`/booking/${booking.id}`} className="btn btn-sm btn-outline">
            Open booking
          </PrefetchOnIntentLink>
          <PrefetchOnIntentLink href="/packing-list" className="btn btn-sm btn-primary">
            Open packing list
          </PrefetchOnIntentLink>
        </div>
      </div>
    </div>
  );
}

export default function TomorrowPackingClient({ data }: { data: TomorrowPackingPageData }) {
  return (
    <div>
      <div className="page-banner" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Tomorrow&apos;s Packing</h1>
          <div>{data.tomorrowDisplay}</div>
        </div>
        <div className="page-banner-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-outline btn-sm">
            Dashboard
          </Link>
          <Link href="/packing-list" className="btn btn-gold btn-sm">
            Full packing list
          </Link>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card warning">
          <div className="stat-value">{data.leftCount}</div>
          <div className="stat-label">Packing left</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
            {data.leftItemCount} item{data.leftItemCount === 1 ? "" : "s"} pending
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{data.doneCount}</div>
          <div className="stat-label">Packing done</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
            {data.doneItemCount} item{data.doneItemCount === 1 ? "" : "s"} packed
          </div>
        </div>
      </div>

      {(data.divisions || []).map((div) => {
        if (!div.packingLeft.length && !div.packingDone.length) return null;
        return (
          <section key={div.key} style={{ marginBottom: 36 }}>
            <div
              className="card-header"
              style={{
                paddingLeft: 0,
                paddingRight: 0,
                borderBottom: "2px solid var(--gold, #c9a84c)",
                marginBottom: 16,
              }}
            >
              <h2 className="card-title" style={{ margin: 0, fontSize: 20 }}>
                {div.label}
                <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>
                  {div.packingLeft.length} left · {div.packingDone.length} done
                </span>
              </h2>
            </div>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Packing left ({div.packingLeft.length})</h3>
              {div.packingLeft.length ? (
                div.packingLeft.map((b) => (
                  <BookingCard key={`${div.key}-left-${b.id}`} booking={b} tone="left" />
                ))
              ) : (
                <div className="card">
                  <div className="card-body" style={{ color: "var(--text-muted)" }}>
                    No {div.label.toLowerCase()} packing left.
                  </div>
                </div>
              )}
            </div>
            <div>
              <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Packing done ({div.packingDone.length})</h3>
              {div.packingDone.length ? (
                div.packingDone.map((b) => (
                  <BookingCard key={`${div.key}-done-${b.id}`} booking={b} tone="done" />
                ))
              ) : (
                <div className="card">
                  <div className="card-body" style={{ color: "var(--text-muted)" }}>
                    No {div.label.toLowerCase()} packing completed yet.
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
