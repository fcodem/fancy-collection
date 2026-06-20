"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import type { BookingItemPricingRow } from "@/lib/dress";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";

export default function ReturnDetailClient({
  booking,
  items,
  itemDelivery = [],
}: {
  booking: BookingForStandardDetails & {
    id: number;
    monthlySerial: number;
    status: string;
    remainingCollected: number;
    securityCollected: number;
    securityHeld?: number;
    incompleteNotes?: string | null;
    incompletePhoto?: string | null;
    idPhoto1?: string | null;
    idPhoto2?: string | null;
    totalPrice?: number;
    price?: number;
    totalAdvance?: number;
    advance?: number;
    totalRemaining?: number;
    remaining?: number;
    deliveryNotes?: string | null;
  };
  items: BookingItemPricingRow[];
  itemDelivery?: Array<{
    dressName: string;
    category?: string | null;
    size?: string;
    photo?: string;
    isDelivered: boolean;
    isPackedReady?: boolean;
    preparedBy?: string;
    checkedBy?: string;
    packingNote?: string;
    itemRemainingCollected: number;
    itemSecurityCollected: number;
    itemDeliveryNotes?: string | null;
  }>;
}) {
  const router = useRouter();
  const [incompleteNotes, setIncompleteNotes] = useState("");
  const [securityHeld, setSecurityHeld] = useState(booking.securityCollected || booking.securityDeposit || "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const totalPrice = booking.totalPrice ?? booking.price ?? 0;
  const totalAdvance = booking.totalAdvance ?? booking.advance ?? 0;
  const totalRemaining = booking.totalRemaining ?? booking.remaining ?? 0;
  // Accept returns when delivered OR when status is booked but all items are delivered
  const allItemsDelivered = itemDelivery.length > 0 ? itemDelivery.every((d) => d.isDelivered) : false;
  const isDelivered = booking.status === "delivered" || (booking.status === "booked" && allItemsDelivered);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function act(action: string) {
    setSaving(true);
    try {
      if (action === "incomplete_return") {
        const form = new FormData();
        form.append("action", action);
        form.append("incomplete_notes", incompleteNotes);
        form.append("security_held", String(Number(securityHeld) || 0));
        if (photoFile) form.append("incomplete_photo", photoFile);
        await fetch(`/api/return/${booking.id}/save`, { method: "POST", body: form });
      } else {
        await fetch(`/api/return/${booking.id}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex",gap: 12, marginBottom: 16, flexWrap: "wrap" }} className="no-print">
        <Link href={`/booking/${booking.id}`} className="btn btn-outline">View Booking</Link>
        {booking.status !== "returned" && booking.status !== "cancelled" && (
          <Link
            href={booking.status === "delivered" ? `/booking-delivery/${booking.id}` : `/booking/${booking.id}/edit`}
            className="btn btn-outline"
          >
            {booking.status === "delivered" ? "Edit (Delivery)" : "Edit"}
          </Link>
        )}
        {booking.status === "booked" && (
          <Link href={`/booking-delivery/${booking.id}`} className="btn btn-primary">
            <i className="fa-solid fa-truck-fast" /> Delivery
          </Link>
        )}
        {isDelivered && !showCancel && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--danger)" }}
            onClick={() => setShowCancel(true)}
          >
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

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            Return — #{String(booking.monthlySerial).padStart(2, "0")} {booking.customerName}
          </h3>
          <span className={`badge badge-${booking.status === "delivered" ? "warning" : booking.status === "incomplete_return" ? "incomplete_return" : "success"}`}>
            {booking.status.toUpperCase()}
          </span>
        </div>
        <div className="card-body">
          <BookingRecordDetails
            booking={booking}
            items={items}
            remainingCollected={booking.remainingCollected}
            extra={
              <>
                {booking.securityCollected > 0 && (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>SECURITY COLLECTED </span>
                    ₹{formatInr(booking.securityCollected)}
                  </div>
                )}
                {booking.deliveryNotes && (
                  <div style={{ marginTop: 8, fontSize: 13, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>DELIVERY NOTES </span>
                    {booking.deliveryNotes}
                  </div>
                )}
                {(booking.idPhoto1 || booking.idPhoto2) && (
                  <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(90,20,51,0.04)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 10 }}>
                      <i className="fa-solid fa-id-card" style={{ marginRight: 6 }} />
                      CUSTOMER ID PHOTOS
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {booking.idPhoto1 && (
                        <a href={photoUrl(booking.idPhoto1)} target="_blank" rel="noreferrer">
                          <img
                            src={photoUrl(booking.idPhoto1)}
                            alt="Customer ID 1"
                            style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                          />
                        </a>
                      )}
                      {booking.idPhoto2 && (
                        <a href={photoUrl(booking.idPhoto2)} target="_blank" rel="noreferrer">
                          <img
                            src={photoUrl(booking.idPhoto2)}
                            alt="Customer ID 2"
                            style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                          />
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {itemDelivery.filter((d) => d.isDelivered).map((d, i) => (
                  <div key={i} style={{ marginTop: 12, fontSize: 13, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(46,125,50,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {d.photo && (
                        <img src={photoUrl(d.photo)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                      )}
                      <div>
                        <strong>{d.dressName}</strong>
                        {(d.category || d.size) && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {[d.category, d.size].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <span className="badge badge-success" style={{ marginLeft: "auto" }}>Delivered</span>
                    </div>
                    {(d.preparedBy || d.checkedBy || d.packingNote || d.isPackedReady) && (
                      <div style={{ marginBottom: 8, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8, fontSize: 12 }}>
                        <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>PACKING INFO</strong>
                        {d.isPackedReady && <div>Status: Packed &amp; ready</div>}
                        {d.preparedBy && <div>Prepared by: {d.preparedBy}</div>}
                        {d.checkedBy && <div>Checked by: {d.checkedBy}</div>}
                        {d.packingNote && <div>Note: {d.packingNote}</div>}
                      </div>
                    )}
                    <div style={{ fontSize: 12 }}>
                      {d.itemRemainingCollected > 0 && <span>Remaining collected ₹{formatInr(d.itemRemainingCollected)}</span>}
                      {d.itemRemainingCollected > 0 && d.itemSecurityCollected > 0 && <span> · </span>}
                      {d.itemSecurityCollected > 0 && <span>Security collected ₹{formatInr(d.itemSecurityCollected)}</span>}
                    </div>
                    {d.itemDeliveryNotes && (
                      <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
                        <strong>Delivery note:</strong> {d.itemDeliveryNotes}
                      </div>
                    )}
                  </div>
                ))}
              </>
            }
          />
        </div>
      </div>

      {isDelivered && booking.status !== "returned" && booking.status !== "cancelled" && booking.status !== "incomplete_return" && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">Mark Return</h3></div>
          <div className="card-body">
            <button className="btn btn-primary" style={{ marginRight: 12 }} disabled={saving} onClick={() => act("mark_returned")}>
              Mark Returned (Complete)
            </button>
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <h4 style={{ marginBottom: 12 }}>Incomplete Return</h4>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Missing Items / Notes</label>
                <textarea className="form-control" value={incompleteNotes} onChange={(e) => setIncompleteNotes(e.target.value)} rows={2} placeholder="What items are missing?" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Security Held (₹)</label>
                <input type="number" className="form-control" value={securityHeld} onChange={(e) => setSecurityHeld(e.target.value)} min={0} step="0.01" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Photo of Incomplete Item <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
                <input type="file" className="form-control" accept="image/*" capture="environment" onChange={onPhotoChange} />
                {photoPreview && (
                  <img src={photoPreview} alt="Preview" style={{ marginTop: 8, maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)" }} />
                )}
              </div>
              <button className="btn btn-outline" disabled={saving} onClick={() => act("incomplete_return")}>
                Mark Incomplete Return
              </button>
            </div>
          </div>
        </div>
      )}

      {booking.status === "returned" && (
        <div className="card" style={{ borderLeft: "4px solid var(--success)" }}>
          <div className="card-body">
            <h3 style={{ color: "var(--success)", marginBottom: 8 }}>
              <i className="fa-solid fa-circle-check" /> Return Complete
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>This booking has been fully returned.</p>
          </div>
        </div>
      )}

      {booking.status === "incomplete_return" && (
        <div className="card" style={{ borderLeft: "4px solid #f39c12" }}>
          <div className="card-body">
            <h3 style={{ color: "#f39c12", marginBottom: 12 }}>
              <i className="fa-solid fa-circle-exclamation" /> Incomplete Return
            </h3>
            <p><strong>Missing Items:</strong> {booking.incompleteNotes || "—"}</p>
            <p><strong>Security Held:</strong> ₹{formatInr(booking.securityHeld || 0)}</p>
            {booking.incompletePhoto && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Photo</p>
                <a href={photoUrl(booking.incompletePhoto)} target="_blank" rel="noreferrer">
                  <img
                    src={photoUrl(booking.incompletePhoto)}
                    alt="Incomplete item"
                    style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </a>
              </div>
            )}
            <Link href="/incomplete-return" className="btn btn-outline" style={{ marginTop: 16 }}>
              View in Incomplete Returns
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
