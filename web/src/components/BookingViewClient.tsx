"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";

function editHref(id: number, status: string) {
  return status === "delivered" ? `/booking-delivery/${id}` : `/booking/${id}/edit`;
}

export default function BookingViewClient({
  booking,
  qrSlot,
}: {
  booking: BookingForStandardDetails & {
    id: number;
    monthlySerial: number;
    bookingNumber: string;
    status: string;
    staffNames?: string | null;
    totalAdvance?: number;
    totalRemaining?: number;
    remainingCollected?: number;
  };
  qrSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [showCancel, setShowCancel] = useState(false);

  const isDelivered = booking.status === "delivered";
  const totalPrice = booking.totalPrice ?? booking.price ?? 0;
  const totalAdvance = booking.totalAdvance ?? booking.advance ?? 0;
  const totalRemaining = booking.totalRemaining ?? booking.remaining ?? 0;

  async function confirmSimpleCancel() {
    if (!confirm("Cancel this booking? It will move to Recycle Bin.")) return;
    const res = await fetch(`/api/booking/${booking.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refund_amount: 0 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not cancel booking");
      return;
    }
    router.push("/recycle-bin");
  }

  function openCancel() {
    if (isDelivered) {
      setShowCancel(true);
      return;
    }
    void confirmSimpleCancel();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }} className="no-print">
        <Link href={editHref(booking.id, booking.status)} className="btn btn-outline">
          {isDelivered ? "Edit (Delivery)" : "Edit"}
        </Link>
        <Link href={`/booking/${booking.id}/print`} className="btn btn-primary">Print Bill</Link>
        {booking.status === "booked" && (
          <Link href={`/booking-delivery/${booking.id}`} className="btn btn-primary">
            <i className="fa-solid fa-truck-fast" /> Delivery
          </Link>
        )}
        {booking.status === "delivered" && (
          <Link href={`/return/${booking.id}`} className="btn btn-gold">
            <i className="fa-solid fa-rotate-left" /> Return
          </Link>
        )}
        {booking.status !== "cancelled" && !showCancel && (
          <button type="button" className="btn btn-outline" style={{ color: "var(--danger)" }} onClick={openCancel}>
            Cancel Booking
          </button>
        )}
      </div>

      {showCancel && isDelivered && (
        <DeliveredCancelBooking
          bookingId={booking.id}
          totalPrice={totalPrice}
          totalAdvance={totalAdvance}
          totalRemaining={totalRemaining}
          remainingCollected={booking.remainingCollected ?? 0}
          variant="inline"
          onDismiss={() => setShowCancel(false)}
        />
      )}

      {booking.status === "delivered" && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", marginBottom: 16, background: "linear-gradient(135deg,rgba(46,125,50,0.10),rgba(46,125,50,0.04))", border: "2px solid var(--success)", borderRadius: 12 }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 28, color: "var(--success)" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--success)" }}>DRESS DELIVERED</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>This booking has been marked as delivered. Use the Return button when dress is returned.</div>
          </div>
        </div>
      )}
      {booking.status === "returned" && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", marginBottom: 16, background: "linear-gradient(135deg,rgba(21,101,192,0.10),rgba(21,101,192,0.04))", border: "2px solid #1565c0", borderRadius: 12 }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 28, color: "#1565c0" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1565c0" }}>DRESS RETURNED</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>This booking has been completed and dress returned.</div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <h3 className="card-title">Booking #{String(booking.monthlySerial).padStart(2, "0")}</h3>
            <span className={`badge badge-${booking.status === "booked" ? "warning" : booking.status === "delivered" ? "success" : booking.status === "returned" ? "info" : booking.status === "cancelled" ? "danger" : "info"}`} style={{ fontSize: 12, padding: "4px 12px", fontWeight: 700 }}>
              {booking.status === "delivered" ? "✓ DELIVERED" : booking.status === "returned" ? "✓ RETURNED" : booking.status === "booked" ? "BOOKED" : booking.status === "cancelled" ? "CANCELLED" : booking.status.toUpperCase()}
            </span>
          </div>
          {qrSlot}
        </div>
        <div className="card-body">
          <BookingRecordDetails
            booking={booking}
            extra={
              booking.staffNames ? (
                <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
                  <strong>Staff:</strong> {booking.staffNames}
                </p>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
