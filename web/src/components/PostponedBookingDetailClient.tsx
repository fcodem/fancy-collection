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
}: {
  booking: BookingForStandardDetails & {
    id: number;
    monthlySerial: number;
    customerName: string;
  };
  status: string;
  totalAdvance: number;
  postponedAt: string | null;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const serialLabel = `#${String(booking.monthlySerial).padStart(2, "0")}`;
  const canPostpone = status === "booked";
  const isPostponed = status === "postponed";
  const confirmOk = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  async function markPostponed() {
    if (!confirmOk) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/postponed-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "postpone", booking_id: booking.id }),
      });
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
              disabled={!confirmOk || busy}
              onClick={() => void markPostponed()}
            >
              {busy ? "Postponing…" : "Mark Postponed"}
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
