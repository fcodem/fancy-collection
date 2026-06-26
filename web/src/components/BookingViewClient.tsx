"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import { BookingItemWarningsSection } from "@/components/BookingItemWarningsSection";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import BookingWhatsAppButton from "@/components/BookingWhatsAppButton";
import { isBookingLocked } from "@/lib/bookingLock";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { resolveBookingStatus } from "@/lib/bookingStatus";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

function editHref(id: number, status: string) {
  return status === "delivered" ? `/booking-delivery/${id}` : `/booking/${id}/edit`;
}

export default function BookingViewClient({
  booking,
  qrSlot,
  isOwner = false,
  warningItems = [],
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
    whatsappNo?: string | null;
    contact1?: string;
    whatsappStatus?: string | null;
    publicBookingId?: string | null;
    bookingItems?: Array<{ isDelivered: boolean }>;
  };
  qrSlot?: React.ReactNode;
  isOwner?: boolean;
  warningItems?: ItemWarningSource[];
}) {
  const router = useRouter();
  const [showCancel, setShowCancel] = useState(false);

  const status = resolveBookingStatus(booking);
  const isDelivered = status === "delivered";
  const locked = isBookingLocked(status);
  const canModify = !locked;
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
    router.push("/booking");
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
        {canModify && (
          <Link href={editHref(booking.id, status)} className="btn btn-outline">
            {isDelivered ? "Edit (Delivery)" : "Edit"}
          </Link>
        )}
        {locked && isOwner && (
          <Link href={`/booking/${booking.id}/edit?unlock=1`} className="btn btn-primary">
            <i className="fa-solid fa-unlock" style={{ marginRight: 6 }} />
            Unlock &amp; Edit
          </Link>
        )}
        <Link href={`/booking/${booking.id}/print`} className="btn btn-primary">Print Bill</Link>
        <BookingWhatsAppButton
          bookingId={booking.id}
          hasPhone={!!(booking.whatsappNo || booking.contact1)}
          whatsappStatus={booking.whatsappStatus}
        />
        {status === "booked" && (
          <>
            <Link href={`/booking-delivery/${booking.id}`} className="btn btn-primary">
              <i className="fa-solid fa-truck-fast" /> Delivery
            </Link>
            <Link href={`/postponed-booking/${booking.id}`} className="btn btn-outline" style={{ color: "#E65100", borderColor: "#E65100" }}>
              <i className="fa-solid fa-clock" /> Postpone
            </Link>
          </>
        )}
        {status === "delivered" && (
          <Link href={`/return/${booking.id}`} className="btn btn-gold">
            <i className="fa-solid fa-rotate-left" /> Return
          </Link>
        )}
        {canModify && status !== "cancelled" && !showCancel && (
          <button type="button" className="btn btn-outline" style={{ color: "var(--danger)" }} onClick={openCancel}>
            Cancel Booking
          </button>
        )}
      </div>

      {locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", marginBottom: 16, background: "rgba(21,101,192,0.08)", border: "2px solid #1565c0", borderRadius: 12 }}>
          <i className="fa-solid fa-lock" style={{ fontSize: 24, color: "#1565c0" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1565c0" }}>COMPLETED — RECORD LOCKED</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {isOwner
                ? "This booking is completed. Use Unlock & Edit to make changes."
                : "This booking is completed and cannot be edited. Contact the owner for changes."}
            </div>
          </div>
        </div>
      )}

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

      {status === "delivered" && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", marginBottom: 16, background: "linear-gradient(135deg,rgba(46,125,50,0.10),rgba(46,125,50,0.04))", border: "2px solid var(--success)", borderRadius: 12 }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 28, color: "var(--success)" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--success)" }}>DRESS DELIVERED</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>This booking has been marked as delivered. Use the Return button when dress is returned.</div>
          </div>
        </div>
      )}
      {status === "returned" && (
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
            <span className={`badge badge-${status === "booked" ? "warning" : status === "delivered" ? "success" : status === "returned" ? "info" : status === "cancelled" ? "danger" : "info"}`} style={{ fontSize: 12, padding: "4px 12px", fontWeight: 700 }}>
              {status === "delivered" ? "✓ DELIVERED" : status === "returned" ? "✓ RETURNED" : status === "booked" ? "BOOKED" : status === "cancelled" ? "CANCELLED" : status.toUpperCase()}
            </span>
          </div>
          {qrSlot}
        </div>
        <div className="card-body">
          <BookingRecordDetails
            booking={booking}
            warningItems={warningItems.length > 1 ? warningItems : undefined}
            extra={
              booking.staffNames ? (
                <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
                  <strong>Staff:</strong> {booking.staffNames}
                </p>
              ) : undefined
            }
          />
          {warningItems.length <= 1 && <BookingItemWarningsSection items={warningItems} />}
        </div>
      </div>
    </div>
  );
}
