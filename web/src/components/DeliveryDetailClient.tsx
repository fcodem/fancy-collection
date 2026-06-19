"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";

type BookingData = BookingForStandardDetails & {
  id: number;
  monthlySerial: number;
  status: string;
  remainingCollected: number;
  securityCollected: number;
  deliveryNotes?: string | null;
};

export default function DeliveryDetailClient({
  booking,
  nextBookings,
  isDelivered = false,
}: {
  booking: BookingData;
  nextBookings: Array<{ dress: string; next_customer: string; next_serial: number; next_time: string; next_venue: string }>;
  isDelivered?: boolean;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(booking.remainingCollected || "");
  const [security, setSecurity] = useState(booking.securityCollected || "");
  const [notes, setNotes] = useState(booking.deliveryNotes || "");
  const [saving, setSaving] = useState(false);

  async function save(markDelivered: boolean) {
    setSaving(true);
    await fetch(`/api/booking-delivery/${booking.id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remaining_collected: Number(remaining) || 0,
        security_collected: Number(security) || 0,
        delivery_notes: notes,
        mark_delivered: markDelivered,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div>
      {isDelivered && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-circle-info" style={{ marginRight: 8 }} />
          This booking is delivered. Update collection details below or scroll down to edit dresses and booking info.
        </div>
      )}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Booking Details</h3>
          <span className={`badge badge-${booking.status === "delivered" ? "success" : "warning"}`}>{booking.status.toUpperCase()}</span>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 12, fontSize: 14 }}>
            <strong>Serial:</strong> #{String(booking.monthlySerial).padStart(2, "0")}
          </p>
          <BookingRecordDetails booking={booking} />
        </div>
      </div>

      {nextBookings.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid #f39c12" }}>
          <div className="card-header"><h3 className="card-title" style={{ color: "#f39c12" }}>Warning: Next booking on return date</h3></div>
          <div className="card-body">
            {nextBookings.map((nb, i) => (
              <p key={i}><strong>{nb.dress}</strong> → {nb.next_customer} (#{String(nb.next_serial).padStart(2, "0")}) at {nb.next_time}</p>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3 className="card-title">Delivery Details</h3></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div><label className="form-label">Remaining Collected (₹)</label><input type="number" className="form-control" value={remaining} onChange={(e) => setRemaining(e.target.value)} /></div>
            <div><label className="form-label">Security Collected (₹)</label><input type="number" className="form-control" value={security} onChange={(e) => setSecurity(e.target.value)} /></div>
            <div><label className="form-label">Max Remaining</label><input className="form-control" disabled value={`₹${formatInr(booking.totalRemaining ?? booking.remaining ?? 0)}`} /></div>
          </div>
          <div style={{ marginBottom: 16 }}><label className="form-label">Delivery Notes</label><textarea className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-outline" disabled={saving} onClick={() => save(false)}>Save Only</button>
            {booking.status === "booked" && <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>Save & Mark Delivered</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
