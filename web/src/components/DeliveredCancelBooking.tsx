"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInr } from "@/lib/format";

type Props = {
  bookingId: number;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  remainingCollected?: number;
  variant?: "button" | "inline";
  onDismiss?: () => void;
};

export default function DeliveredCancelBooking({
  bookingId,
  totalPrice,
  totalAdvance,
  totalRemaining,
  remainingCollected = 0,
  variant = "button",
  onDismiss,
}: Props) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(variant === "inline");
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function confirmCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_amount: Number(refundAmount) || 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not cancel booking");
        return;
      }
      router.push("/booking");
    } finally {
      setCancelling(false);
    }
  }

  const panel = (
    <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid var(--danger)" }}>
      <div className="card-header">
        <h3 className="card-title">Cancel delivered booking</h3>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Dresses will be marked free. Enter any refund given to the customer — deducted from finance reports.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 20,
            padding: 14,
            background: "var(--cream-dark)",
            borderRadius: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>TOTAL RENT</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(totalPrice)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>ADVANCE</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>₹{formatInr(totalAdvance)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>BALANCE</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(totalRemaining)}</div>
          </div>
        </div>

        {remainingCollected > 0 && (
          <p style={{ fontSize: 13, marginBottom: 16, color: "var(--text-muted)" }}>
            Balance collected at delivery: <strong>₹{formatInr(remainingCollected)}</strong>
          </p>
        )}

        <label className="form-label">Refund amount to customer (₹)</label>
        <input
          type="number"
          className="form-control"
          min={0}
          step={1}
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          placeholder="0 if no refund"
          style={{ maxWidth: 280, marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(variant === "button" || onDismiss) && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={cancelling}
              onClick={() => (onDismiss ? onDismiss() : setShowPanel(false))}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
            disabled={cancelling}
            onClick={() => void confirmCancel()}
          >
            {cancelling ? "Cancelling…" : "Confirm cancel"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {variant === "button" && !showPanel && (
        <button
          type="button"
          className="btn btn-outline"
          style={{ color: "var(--danger)" }}
          onClick={() => setShowPanel(true)}
        >
          Cancel Booking
        </button>
      )}
      {showPanel && panel}
    </>
  );
}
