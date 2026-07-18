"use client";

import { useState } from "react";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import type { SlipOrderDisplay } from "@/components/BookingSlip";
import { BookingItemWarningsSection } from "@/components/BookingItemWarningsSection";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import BookingWhatsAppButton from "@/components/BookingWhatsAppButton";
import { isBookingLocked } from "@/lib/bookingLock";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { isDeliverySlipEligible, isCommonDeliverySlipEligible, isIncompleteSlipEligible, isReturnSlipEligible, isCommonReturnSlipEligible, resolveBookingStatus, hasPartialDelivery, hasPartialReturn, deliverySlipHref, returnSlipHref } from "@/lib/bookingStatus";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

function editHref(id: number, status: string) {
  return status === "delivered" ? `/booking-delivery/${id}` : `/booking/${id}/edit`;
}

export default function BookingViewClient({
  booking,
  qrSlot,
  isOwner = false,
  warningItems = [],
  orders = [],
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
    whatsappSentAt?: string | Date | null;
    whatsappStatus?: string | null;
    bookingItems?: Array<{ id?: number; isDelivered: boolean; isReturned?: boolean; isIncompleteReturn?: boolean }>;
  };
  qrSlot?: React.ReactNode;
  isOwner?: boolean;
  warningItems?: ItemWarningSource[];
  orders?: SlipOrderDisplay[];
}) {
  const [showCancel, setShowCancel] = useState(false);

  const status = resolveBookingStatus(booking);
  const isDelivered = status === "delivered";
  const locked = isBookingLocked(status);
  const canModify = !locked;
  const totalPrice = booking.totalPrice ?? booking.price ?? 0;
  const totalAdvance = booking.totalAdvance ?? booking.advance ?? 0;
  const totalRemaining = booking.totalRemaining ?? booking.remaining ?? 0;

  async function openCancel() {
    setShowCancel(true);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }} className="no-print">
        {canModify && (
          <PrefetchOnIntentLink href={editHref(booking.id, status)} className="btn btn-outline">
            {isDelivered ? "Edit (Delivery)" : "Edit"}
          </PrefetchOnIntentLink>
        )}
        {locked && isOwner && (
          <PrefetchOnIntentLink href={`/booking/${booking.id}/edit?unlock=1`} className="btn btn-primary">
            <i className="fa-solid fa-unlock" style={{ marginRight: 6 }} />
            Unlock &amp; Edit
          </PrefetchOnIntentLink>
        )}
        <PrefetchOnIntentLink
          href={`/booking/${booking.id}/customer-slips`}
          className="btn btn-outline slip-action-btn"
          style={{ color: "#5b21b6", borderColor: "#7c3aed", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
          title="View booking, delivery and return slips sent to the customer"
        >
          <i className="fa-solid fa-file-pdf" />
          <span className="slip-btn-label">All Customer Slips</span>
        </PrefetchOnIntentLink>
        <PrefetchOnIntentLink
          href={`/booking/${booking.id}/slip`}
          className="btn btn-outline slip-action-btn"
          style={{ color: "#1a5c2a", borderColor: "#1a5c2a", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Booking Slip"
        >
          <i className="fa-solid fa-receipt" />
          <span className="slip-btn-label">Booking Slip</span>
        </PrefetchOnIntentLink>
        {isDeliverySlipEligible(booking) && isCommonDeliverySlipEligible(booking) && (
          <PrefetchOnIntentLink
            href={deliverySlipHref(booking.id, booking)}
            className="btn btn-outline slip-action-btn"
            style={{ color: "#1565c0", borderColor: "#1565c0", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Delivery Slip"
          >
            <i className="fa-solid fa-truck-fast" />
            <span className="slip-btn-label">Delivery Slip</span>
          </PrefetchOnIntentLink>
        )}
        {isDeliverySlipEligible(booking) && hasPartialDelivery(booking) && (
          <PrefetchOnIntentLink
            href={`/booking-delivery/${booking.id}`}
            className="btn btn-outline slip-action-btn"
            style={{ color: "#1565c0", borderColor: "#1565c0", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Per-dress delivery slips"
          >
            <i className="fa-solid fa-truck-fast" />
            <span className="slip-btn-label">Delivery Slips</span>
          </PrefetchOnIntentLink>
        )}
        {isReturnSlipEligible(booking) && isCommonReturnSlipEligible(booking) && (
          <PrefetchOnIntentLink
            href={returnSlipHref(booking.id, booking)}
            className="btn btn-outline slip-action-btn"
            style={{ color: "#b8860b", borderColor: "#c9a84c", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Return Receipt"
          >
            <i className="fa-solid fa-circle-check" />
            <span className="slip-btn-label">Return Receipt</span>
          </PrefetchOnIntentLink>
        )}
        {isReturnSlipEligible(booking) && hasPartialReturn(booking) && (
          <PrefetchOnIntentLink
            href={`/return/${booking.id}`}
            className="btn btn-outline slip-action-btn"
            style={{ color: "#b8860b", borderColor: "#c9a84c", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Return receipts for returned dresses"
          >
            <i className="fa-solid fa-circle-check" />
            <span className="slip-btn-label">Return Receipts</span>
          </PrefetchOnIntentLink>
        )}
        {isIncompleteSlipEligible(booking) && (
          <PrefetchOnIntentLink
            href={`/booking/${booking.id}/incomplete-slip`}
            className="btn btn-outline slip-action-btn"
            style={{ color: "#c2410c", borderColor: "#f39c12", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
            title="Incomplete Return Slip"
          >
            <i className="fa-solid fa-circle-exclamation" />
            <span className="slip-btn-label">Incomplete Slip</span>
          </PrefetchOnIntentLink>
        )}
        <BookingWhatsAppButton
          bookingId={booking.id}
          hasPhone={!!(booking.whatsappNo || booking.contact1)}
          whatsappSentAt={booking.whatsappSentAt}
          whatsappStatus={booking.whatsappStatus}
          mode="resend"
        />
        {status === "booked" && (
          <>
            <PrefetchOnIntentLink
              href={`/jewellery-selection/${booking.id}`}
              className="btn btn-outline"
              style={{ color: "#b8860b", borderColor: "#c9a84c" }}
              title="Open jewellery selection for this booking"
            >
              <i className="fa-solid fa-gem" /> Jewellery
            </PrefetchOnIntentLink>
            <PrefetchOnIntentLink href={`/booking-delivery/${booking.id}`} className="btn btn-primary">
              <i className="fa-solid fa-truck-fast" /> Delivery
            </PrefetchOnIntentLink>
            <PrefetchOnIntentLink href={`/postponed-booking/${booking.id}`} className="btn btn-outline" style={{ color: "#E65100", borderColor: "#E65100" }}>
              <i className="fa-solid fa-clock" /> Postpone
            </PrefetchOnIntentLink>
          </>
        )}
        {status === "delivered" && (
          <PrefetchOnIntentLink href={`/return/${booking.id}`} className="btn btn-gold">
            <i className="fa-solid fa-rotate-left" /> Return
          </PrefetchOnIntentLink>
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

      {showCancel && (
        <DeliveredCancelBooking
          bookingId={booking.id}
          totalPrice={totalPrice}
          totalAdvance={totalAdvance}
          totalRemaining={totalRemaining}
          remainingCollected={booking.remainingCollected ?? 0}
          delivered={isDelivered}
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
            orders={orders}
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
