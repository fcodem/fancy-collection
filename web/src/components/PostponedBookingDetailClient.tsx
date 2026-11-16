"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import { formatInr } from "@/lib/format";
import { fetchJson } from "@/lib/fetchJson";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";

const CONFIRM_WORD = "POSTPONE";

export default function PostponedBookingDetailClient({
  booking,
  status,
  totalAdvance,
  postponedAt,
  dresses = [],
}: {
  booking: BookingForStandardDetails & {
    id: number;
    monthlySerial: number;
    customerName: string;
  };
  status: string;
  totalAdvance: number;
  postponedAt: string | null;
  dresses?: Array<{ id: number; dressName: string; price: number; advance: number; isDelivered: boolean }>;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const serialLabel = `#${String(booking.monthlySerial).padStart(2, "0")}`;
  const canPostpone = status === "booked";
  const isPostponed = status === "postponed";
  const confirmOk = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const canPickDresses = dresses.length > 1;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selected = dresses.filter((d) => selectedIds.includes(d.id));
  const postponingAll = !canPickDresses || selected.length === dresses.length;
  const heldAdvance = postponingAll ? totalAdvance : selected.reduce((s, d) => s + d.advance, 0);
  const pickOk = !canPickDresses || selected.length > 0;

  function toggleDress(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function markPostponed() {
    if (!confirmOk || !pickOk) return;
    setBusy(true);
    setError("");
    try {
      const data = await fetchJson<{ postponed_booking_id?: number }>("/api/postponed-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postpone",
          booking_id: booking.id,
          ...(postponingAll ? {} : { item_ids: selected.map((d) => d.id) }),
        }),
      });
      if (!postponingAll && data.postponed_booking_id && data.postponed_booking_id !== booking.id) {
        router.push(`/postponed-booking/${data.postponed_booking_id}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not postpone booking");
    } finally {
      setBusy(false);
    }
  }

  async function resolveRecord() {
    if (!confirm("Permanently remove this postponed record? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/postponed-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", booking_id: booking.id }),
      });
      router.push("/postponed-booking");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/postponed-booking" className="btn btn-outline">
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          Back to Postponed Booking
        </Link>
        {canPostpone && (
          <Link href={`/booking/${booking.id}`} className="btn btn-outline">
            View Full Booking
          </Link>
        )}
        {isPostponed && (
          <Link href={`/postponed-booking/${booking.id}/print`} className="btn btn-primary">
            <i className="fa-solid fa-print" style={{ marginRight: 6 }} />
            Postponed Slip
          </Link>
        )}
      </div>

      {isPostponed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 20px",
            marginBottom: 16,
            background: "rgba(230,81,0,0.10)",
            border: "2px solid #E65100",
            borderRadius: 12,
          }}
        >
          <i className="fa-solid fa-clock" style={{ fontSize: 28, color: "#E65100" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#E65100" }}>POSTPONED BOOKING</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {postponedAt ? `Marked postponed on ${postponedAt}. ` : ""}
              Advance held: <strong style={{ color: "#E65100" }}>₹{formatInr(totalAdvance)}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">Booking {serialLabel} — {booking.customerName}</h3>
          <span className={`badge badge-${isPostponed ? "postponed" : status === "booked" ? "booked" : "info"}`}>
            {status.toUpperCase()}
          </span>
        </div>
        <div className="card-body">
          <BookingRecordDetails booking={booking} />
        </div>
      </div>

      {canPostpone && (
        <div className="card" style={{ marginTop: 20, borderLeft: "4px solid #E65100" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "#E65100" }}>
              <i className="fa-solid fa-clock" style={{ marginRight: 8 }} />
              Mark as Postponed
            </h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Dresses will become available for new bookings. Advance of{" "}
              <strong style={{ color: "#E65100" }}>₹{formatInr(totalAdvance)}</strong> moves to the postponed held total
              and is removed from daily sale / finance reports.
            </p>
            {canPickDresses && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Which dresses to postpone?</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() => setSelectedIds(dresses.filter((d) => !d.isDelivered).map((d) => d.id))}
                  >
                    Select all
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setSelectedIds([])}>
                    Clear
                  </button>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {dresses.map((d) => {
                    const checked = selectedIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          border: `1.5px solid ${checked ? "#E65100" : "var(--border)"}`,
                          borderRadius: 8,
                          background: checked ? "rgba(230,81,0,0.06)" : "#fff",
                          opacity: d.isDelivered ? 0.55 : 1,
                          cursor: busy || d.isDelivered ? "not-allowed" : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || d.isDelivered}
                          onChange={() => toggleDress(d.id)}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{d.dressName}</strong>
                          <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>
                            Rent ₹{formatInr(d.price)} · Advance ₹{formatInr(d.advance)}
                            {d.isDelivered ? " · Already delivered" : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
                  {!selected.length
                    ? "Tick the dresses to postpone."
                    : postponingAll
                      ? "All dresses selected — the whole booking will be postponed."
                      : `${selected.length} of ${dresses.length} dresses selected — these move to a separate postponed record (same serial). The other dresses stay booked. Advance held: ₹${formatInr(heldAdvance)}.`}
                </p>
              </div>
            )}
            <label className="form-label">
              Type <strong>{CONFIRM_WORD}</strong> to confirm
            </label>
            <input
              type="text"
              className="form-control"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              spellCheck={false}
              style={{ maxWidth: 280, marginBottom: 12, textTransform: "uppercase" }}
            />
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: "#E65100", borderColor: "#E65100" }}
              disabled={!confirmOk || busy || !pickOk}
              onClick={() => void markPostponed()}
            >
              {busy
                ? "Postponing…"
                : postponingAll
                  ? "Mark Postponed"
                  : `Postpone ${selected.length} dress${selected.length === 1 ? "" : "es"}`}
            </button>
          </div>
        </div>
      )}

      {isPostponed && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h3 className="card-title">Resolve Record</h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Resolve permanently deletes this postponed record from everywhere.
            </p>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <button type="button" className="btn btn-outline" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} disabled={busy} onClick={() => void resolveRecord()}>
              Resolve &amp; Remove
            </button>
          </div>
        </div>
      )}

      {status !== "booked" && !isPostponed && (
        <div className="alert alert-warning" style={{ marginTop: 20 }}>
          This booking cannot be postponed (status: {status}). Only booked, not-yet-delivered records can be postponed.
        </div>
      )}
    </div>
  );
}
