"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";

type ItemRow = {
  id: number;
  dressName: string;
  category?: string | null;
  size?: string | null;
  price: number;
  remaining: number;
  photo?: string;
  isDelivered: boolean;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
  preparedBy?: string;
  checkedBy?: string;
  packingNote?: string;
};

type BookingData = BookingForStandardDetails & {
  id: number;
  monthlySerial: number;
  status: string;
  remainingCollected: number;
  securityCollected: number;
  deliveryNotes?: string | null;
  totalRemaining?: number;
  remaining?: number;
};

type ItemFormState = {
  remaining: string;
  security: string;
  notes: string;
};

export default function DeliveryDetailClient({
  booking,
  items,
  nextBookings,
  isDelivered = false,
}: {
  booking: BookingData;
  items: ItemRow[];
  nextBookings: Array<{ dress: string; next_customer: string; next_serial: number; next_time: string; next_venue: string }>;
  isDelivered?: boolean;
}) {
  const router = useRouter();
  const [itemForms, setItemForms] = useState<Record<number, ItemFormState>>(() => {
    const init: Record<number, ItemFormState> = {};
    for (const it of items) {
      init[it.id] = {
        remaining: String(it.itemRemainingCollected || ""),
        security: String(it.itemSecurityCollected || ""),
        notes: it.itemDeliveryNotes || "",
      };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingDelivered, setEditingDelivered] = useState<Record<number, boolean>>({});

  const allDelivered = items.length > 0 ? items.every((it) => it.isDelivered) : isDelivered;
  const hasMultiple = items.length > 1;

  function updateItem(id: number, field: keyof ItemFormState, value: string) {
    setItemForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveItem(itemId: number) {
    setSaving(true);
    setError("");
    const it = items.find((i) => i.id === itemId);
    if (!it) { setSaving(false); return; }

    const payload = {
      items: [{
        booking_item_id: itemId,
        remaining_collected: Number(itemForms[itemId]?.remaining) || 0,
        security_collected: Number(itemForms[itemId]?.security) || 0,
        delivery_notes: itemForms[itemId]?.notes || "",
        mark_delivered: !it.isDelivered,
        update_only: it.isDelivered && editingDelivered[itemId],
      }],
    };

    const res = await fetch(`/api/booking-delivery/${booking.id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    router.refresh();
  }

  async function saveAll(markDelivered = false) {
    setSaving(true);
    setError("");
    const pending = items.filter((it) => !it.isDelivered);
    if (!pending.length) { setSaving(false); return; }
    const payload = {
      items: pending.map((it) => ({
        booking_item_id: it.id,
        remaining_collected: Number(itemForms[it.id]?.remaining) || 0,
        security_collected: Number(itemForms[it.id]?.security) || 0,
        delivery_notes: itemForms[it.id]?.notes || "",
        mark_delivered: markDelivered,
      })),
    };

    const res = await fetch(`/api/booking-delivery/${booking.id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {allDelivered && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
          All dresses delivered. Scroll down to edit booking details if needed.
        </div>
      )}
      {!allDelivered && isDelivered && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
          Some dresses are not yet delivered. Mark each dress individually below.
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Booking Details</h3>
          <span className={`badge badge-${allDelivered ? "success" : "warning"}`}>
            {allDelivered ? "ALL DELIVERED" : booking.status.toUpperCase()}
          </span>
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

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-truck-fast" style={{ marginRight: 8 }} />
            {hasMultiple ? "Deliver Each Dress" : "Delivery Details"}
          </h3>
        </div>
        <div className="card-body">
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                border: `1.5px solid ${it.isDelivered ? "var(--success)" : "var(--border)"}`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                background: it.isDelivered ? "rgba(46,125,50,0.04)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                {it.photo && (
                  <img src={photoUrl(it.photo)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{it.dressName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {it.category}{it.size ? ` · ${it.size}` : ""} · Rent ₹{formatInr(it.price)} · Remaining ₹{formatInr(it.remaining)}
                  </div>
                </div>
                {it.isDelivered ? (
                  <span className="badge badge-success"><i className="fa-solid fa-check" /> Delivered</span>
                ) : (
                  <span className="badge badge-warning">Pending</span>
                )}
              </div>

              {(it.preparedBy || it.checkedBy || it.packingNote) && (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8, fontSize: 12 }}>
                  <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>PACKING INFO</strong>
                  {it.preparedBy && <div>Prepared by: {it.preparedBy}</div>}
                  {it.checkedBy && <div>Checked by: {it.checkedBy}</div>}
                  {it.packingNote && <div>Note: {it.packingNote}</div>}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Remaining Collected (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={itemForms[it.id]?.remaining ?? ""}
                    onChange={(e) => updateItem(it.id, "remaining", e.target.value)}
                    disabled={it.isDelivered && !editingDelivered[it.id]}
                  />
                </div>
                <div>
                  <label className="form-label">Security Collected (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={itemForms[it.id]?.security ?? ""}
                    onChange={(e) => updateItem(it.id, "security", e.target.value)}
                    disabled={it.isDelivered && !editingDelivered[it.id]}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Delivery Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={itemForms[it.id]?.notes ?? ""}
                  onChange={(e) => updateItem(it.id, "notes", e.target.value)}
                  disabled={it.isDelivered && !editingDelivered[it.id]}
                  placeholder="Notes for this dress…"
                />
              </div>
              {!it.isDelivered && (
                <button
                  className="btn btn-primary btn-sm"
                  disabled={saving}
                  onClick={() => saveItem(it.id)}
                >
                  <i className="fa-solid fa-truck" style={{ marginRight: 6 }} />
                  Deliver This Dress
                </button>
              )}
              {it.isDelivered && !editingDelivered[it.id] && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setEditingDelivered((prev) => ({ ...prev, [it.id]: true }))}
                >
                  <i className="fa-solid fa-pen" style={{ marginRight: 6 }} />
                  Edit Delivered Record
                </button>
              )}
              {it.isDelivered && editingDelivered[it.id] && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                    onClick={() => saveItem(it.id)}
                  >
                    <i className="fa-solid fa-save" style={{ marginRight: 6 }} />
                    Save Changes
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditingDelivered((prev) => ({ ...prev, [it.id]: false }))}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}

          {!allDelivered && (
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              {items.length > 0 && (
                <button className="btn btn-primary" disabled={saving} onClick={() => saveAll(true)}>
                  <i className="fa-solid fa-truck" style={{ marginRight: 6 }} />
                  Deliver All Dresses
                </button>
              )}
              <button className="btn btn-outline" disabled={saving} onClick={() => saveAll(false)}>
                Save Details Only
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
