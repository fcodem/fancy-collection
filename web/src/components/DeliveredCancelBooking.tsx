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
  delivered?: boolean;
  onDismiss?: () => void;
};

export default function DeliveredCancelBooking({
  bookingId,
  totalPrice,
  totalAdvance,
  totalRemaining,
  remainingCollected = 0,
  variant = "button",
  delivered = true,
  onDismiss,
}: Props) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(variant === "inline");
  const [advanceReturned, setAdvanceReturned] = useState<boolean | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelling, setCancelling] = useState(false);

  function selectAdvanceReturned(yes: boolean) {
    setAdvanceReturned(yes);
    if (yes) {
      setRefundAmount(String(totalAdvance));
    } else {
      setRefundAmount("");
    }
  }

  async function confirmCancel() {
    if (advanceReturned === null) {
      alert("Please indicate whether advance was returned to the customer.");
      return;
    }
    setCancelling(true);
    try {
      const refund = advanceReturned ? Number(refundAmount) || 0 : 0;
      const res = await fetch(`/api/booking/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_amount: refund }),
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
        <h3 className="card-title">
          {delivered ? "Cancel delivered booking" : "Cancel booking"}
        </h3>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Dresses will be marked free.
          {delivered
            ? " Indicate whether advance was returned — refunded advance is deducted from finance reports."
            : " Indicate whether advance was returned to the customer."}
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
          {delivered && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>BALANCE</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(totalRemaining)}</div>
            </div>
          )}
        </div>

        {delivered && remainingCollected > 0 && (
          <p style={{ fontSize: 13, marginBottom: 16, color: "var(--text-muted)" }}>
            Balance collected at delivery: <strong>₹{formatInr(remainingCollected)}</strong>
          </p>
        )}

        <label className="form-label">Advance returned to customer?</label>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${advanceReturned === true ? "btn-primary" : "btn-outline"}`}
            disabled={cancelling}
            onClick={() => selectAdvanceReturned(true)}
          >
            Yes
          </button>
          <button
            type="button"
            className={`btn ${advanceReturned === false ? "btn-primary" : "btn-outline"}`}
            disabled={cancelling}
            onClick={() => selectAdvanceReturned(false)}
          >
            No
          </button>
        </div>

        {advanceReturned === true && (
          <>
            <label className="form-label">Refund amount to customer (₹)</label>
            <input
              type="number"
              className="form-control"
              min={0}
              step={1}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={String(totalAdvance)}
              style={{ maxWidth: 280, marginBottom: 16 }}
            />
          </>
        )}

        {advanceReturned === false && (
          <p style={{ fontSize: 13, marginBottom: 16, color: "var(--text-muted)" }}>
            No refund recorded — advance is kept and will not reduce finance sale totals.
          </p>
        )}

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
            disabled={cancelling || advanceReturned === null}
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
