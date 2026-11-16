"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInr } from "@/lib/format";

export type CancelableDress = {
  id: number;
  dressName: string;
  size?: string | null;
  price: number;
  advance: number;
  remaining?: number;
  isCancelled?: boolean;
  isDelivered?: boolean;
  isReturned?: boolean;
};

type Props = {
  bookingId: number;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  remainingCollected?: number;
  variant?: "button" | "inline";
  delivered?: boolean;
  /** Dresses on the booking — when 2+ are active, staff can cancel only some of them. */
  items?: CancelableDress[];
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
  items = [],
  onDismiss,
}: Props) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(variant === "inline");
  const [advanceReturned, setAdvanceReturned] = useState<boolean | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const activeItems = items.filter((i) => !i.isCancelled);
  const canPickDresses = activeItems.length > 1;
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    activeItems.length > 1 ? [] : activeItems.map((i) => i.id),
  );
  const selectedItems = activeItems.filter((i) => selectedIds.includes(i.id));
  const cancellingAll = !canPickDresses || selectedItems.length === activeItems.length;
  const blockedSelected = cancellingAll
    ? []
    : selectedItems.filter((i) => i.isDelivered || i.isReturned);
  const selectedPrice = selectedItems.reduce((s, i) => s + (i.price || 0), 0);
  const selectedAdvance = selectedItems.reduce((s, i) => s + (i.advance || 0), 0);
  const selectedRemaining = selectedItems.reduce(
    (s, i) => s + (i.remaining != null ? i.remaining : Math.max(0, (i.price || 0) - (i.advance || 0))),
    0,
  );

  /** Amounts shown in the summary — always match what will be cancelled. */
  const displayRent = canPickDresses ? selectedPrice : totalPrice;
  const displayAdvance = canPickDresses ? selectedAdvance : totalAdvance;
  const displayRemaining = canPickDresses ? selectedRemaining : totalRemaining;
  const refundHint = canPickDresses && !cancellingAll ? selectedAdvance : totalAdvance;

  function setSelection(ids: number[]) {
    setSelectedIds(ids);
    setError("");
    if (advanceReturned === true) {
      const nextItems = activeItems.filter((i) => ids.includes(i.id));
      const nextAll = nextItems.length === activeItems.length;
      const nextAdvance = nextAll
        ? totalAdvance
        : nextItems.reduce((s, i) => s + (i.advance || 0), 0);
      setRefundAmount(String(nextAdvance));
    }
  }

  function toggleDress(id: number) {
    setSelection(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  function selectAdvanceReturned(yes: boolean) {
    setAdvanceReturned(yes);
    setError("");
    if (yes) {
      setRefundAmount(String(refundHint));
    } else {
      setRefundAmount("");
    }
  }

  async function cancelSelectedDresses() {
    for (const item of selectedItems) {
      const res = await fetch(`/api/booking/${bookingId}/items/${item.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_advance: advanceReturned === true }),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.error === "string" ? data.error : "Could not cancel this dress";
        setError(`${item.dressName}: ${msg}`);
        router.replace(`/booking/${bookingId}?updated=1`);
        return false;
      }
    }
    return true;
  }

  async function confirmCancel() {
    setError("");
    if (advanceReturned === null) {
      setError("Please indicate whether advance was returned to the customer.");
      return;
    }
    if (canPickDresses && !selectedItems.length) {
      setError("Select at least one dress to cancel.");
      return;
    }
    if (blockedSelected.length) {
      setError(
        `${blockedSelected.map((i) => i.dressName).join(", ")} already delivered — return it instead, or cancel the whole booking.`,
      );
      return;
    }
    setCancelling(true);
    try {
      if (!cancellingAll) {
        const ok = await cancelSelectedDresses();
        if (!ok) return;
        onDismiss ? onDismiss() : setShowPanel(false);
        // Bypass short booking-record cache so cancelled dresses show immediately.
        router.replace(`/booking/${bookingId}?updated=1`);
        return;
      }
      const refund = advanceReturned ? Number(refundAmount) || 0 : 0;
      const res = await fetch(`/api/booking/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_amount: refund }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not cancel booking");
        return;
      }
      router.push("/booking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error — try again");
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

        {canPickDresses && (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Which dresses to cancel?</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={cancelling}
                onClick={() => setSelection(activeItems.map((i) => i.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={cancelling}
                onClick={() => setSelection([])}
              >
                Clear
              </button>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {activeItems.map((item) => {
                const checked = selectedIds.includes(item.id);
                const out = item.isDelivered || item.isReturned;
                return (
                  <label
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      border: `1.5px solid ${checked ? "var(--danger)" : "var(--border)"}`,
                      borderRadius: 8,
                      background: checked ? "rgba(220,53,69,0.06)" : "#fff",
                      cursor: cancelling ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={cancelling}
                      onChange={() => toggleDress(item.id)}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.dressName}</strong>
                      {item.size ? ` · Size ${item.size}` : ""}
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>
                        Rent ₹{formatInr(item.price)} · Advance ₹{formatInr(item.advance)}
                        {out ? (item.isReturned ? " · Returned" : " · Delivered") : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
              {!selectedItems.length
                ? "Tick the dresses to cancel — payment below updates for your selection."
                : cancellingAll
                  ? "All dresses selected — the whole booking will be cancelled."
                  : `${selectedItems.length} of ${activeItems.length} dresses selected — only these will be cancelled; the rest of the booking stays active.`}
            </p>
          </div>
        )}

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
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
              {canPickDresses && !cancellingAll ? "SELECTED RENT" : "TOTAL RENT"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(displayRent)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
              {canPickDresses && !cancellingAll ? "SELECTED ADVANCE" : "ADVANCE"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>
              ₹{formatInr(displayAdvance)}
            </div>
          </div>
          {delivered && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                {canPickDresses && !cancellingAll ? "SELECTED BALANCE" : "BALANCE"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(displayRemaining)}</div>
            </div>
          )}
        </div>

        {delivered && remainingCollected > 0 && cancellingAll && (
          <p style={{ fontSize: 13, marginBottom: 16, color: "var(--text-muted)" }}>
            Balance collected at delivery: <strong>₹{formatInr(remainingCollected)}</strong>
          </p>
        )}

        <label className="form-label">Advance returned to customer?</label>
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${advanceReturned === true ? "btn-primary" : "btn-outline"}`}
            disabled={cancelling || (canPickDresses && !selectedItems.length)}
            onClick={() => selectAdvanceReturned(true)}
          >
            Yes
          </button>
          <button
            type="button"
            className={`btn ${advanceReturned === false ? "btn-primary" : "btn-outline"}`}
            disabled={cancelling || (canPickDresses && !selectedItems.length)}
            onClick={() => selectAdvanceReturned(false)}
          >
            No
          </button>
        </div>

        {advanceReturned === true && !cancellingAll && (
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            Refund to customer: <strong>₹{formatInr(selectedAdvance)}</strong>{" "}
            <span style={{ color: "var(--text-muted)" }}>(advance paid on the selected dresses)</span>
          </p>
        )}

        {advanceReturned === true && cancellingAll && (
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

        {error ? (
          <p style={{ fontSize: 13, marginBottom: 16, color: "var(--danger)", fontWeight: 600 }}>
            {error}
          </p>
        ) : null}

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
            disabled={cancelling || advanceReturned === null || (canPickDresses && !selectedItems.length)}
            onClick={() => void confirmCancel()}
          >
            {cancelling
              ? "Cancelling…"
              : cancellingAll
                ? "Confirm cancel"
                : `Cancel ${selectedItems.length} dress${selectedItems.length === 1 ? "" : "es"} (₹${formatInr(selectedPrice)})`}
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
