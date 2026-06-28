"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import BookingItemWarningsBlock, {
  BookingItemWarningsSection,
  findItemWarnings,
} from "@/components/BookingItemWarningsSection";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import PaymentModePicker, { type PaymentMode } from "@/components/PaymentModePicker";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";
import { deliverySlipHref, hasPartialDelivery } from "@/lib/bookingStatus";

type ItemRow = {
  id: number;
  itemId?: number;
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
  remainingPaymentMode?: string | null;
  securityPaymentMode?: string | null;
};

type ItemFormState = {
  remaining: string;
  security: string;
  notes: string;
};

type SaveItemResponse = {
  id: number;
  isDelivered: boolean;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
};

export default function DeliveryDetailClient({
  booking,
  items: initialItems,
  warningItems = [],
  nextBookings,
  isDelivered = false,
  idPhoto1 = null,
  idPhoto2 = null,
}: {
  booking: BookingData;
  items: ItemRow[];
  warningItems?: ItemWarningSource[];
  nextBookings: Array<{ dress: string; next_customer: string; next_serial: number; next_time: string; next_venue: string }>;
  isDelivered?: boolean;
  idPhoto1?: string | null;
  idPhoto2?: string | null;
}) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(initialItems);
  const [bookingStatus, setBookingStatus] = useState(booking.status);
  const [itemForms, setItemForms] = useState<Record<number, ItemFormState>>(() => {
    const init: Record<number, ItemFormState> = {};
    for (const it of initialItems) {
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
  const [idPhoto1File, setIdPhoto1File] = useState<File | null>(null);
  const [idPhoto2File, setIdPhoto2File] = useState<File | null>(null);
  const [idPhoto1Preview, setIdPhoto1Preview] = useState<string | null>(null);
  const [idPhoto2Preview, setIdPhoto2Preview] = useState<string | null>(null);
  const [savedIdPhoto1, setSavedIdPhoto1] = useState(idPhoto1);
  const [savedIdPhoto2, setSavedIdPhoto2] = useState(idPhoto2);
  const [savingIdPhotos, setSavingIdPhotos] = useState(false);
  const [idPhotoMessage, setIdPhotoMessage] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    booking.remainingPaymentMode === "online" ? "online" : "cash",
  );
  const [securityPaymentMode, setSecurityPaymentMode] = useState<PaymentMode>(
    booking.securityPaymentMode === "online" ? "online" : "cash",
  );

  useEffect(() => {
    setLocalItems(initialItems);
    setBookingStatus(booking.status);
  }, [initialItems, booking.status]);

  useEffect(() => {
    setSavedIdPhoto1(idPhoto1);
    setSavedIdPhoto2(idPhoto2);
  }, [idPhoto1, idPhoto2]);

  const allDelivered = localItems.length > 0 ? localItems.every((it) => it.isDelivered) : bookingStatus === "delivered";
  const partialDelivery = hasPartialDelivery({
    status: bookingStatus,
    bookingItems: localItems.map((it) => ({ id: it.id, isDelivered: it.isDelivered })),
  });
  const hasMultiple = localItems.length > 1;

  function applySaveResponse(data: { status?: string; items?: SaveItemResponse[] }) {
    if (data.status) setBookingStatus(data.status);
    if (!data.items?.length) return;
    const byId = new Map(data.items.map((it) => [it.id, it]));
    setLocalItems((prev) =>
      prev.map((it) => {
        const saved = byId.get(it.id);
        if (!saved) return it;
        return {
          ...it,
          isDelivered: saved.isDelivered,
          itemRemainingCollected: saved.itemRemainingCollected,
          itemSecurityCollected: saved.itemSecurityCollected,
          itemDeliveryNotes: saved.itemDeliveryNotes,
        };
      }),
    );
    setEditingDelivered((prev) => {
      const next = { ...prev };
      for (const saved of data.items!) {
        if (saved.isDelivered) delete next[saved.id];
      }
      return next;
    });
  }

  function updateItem(id: number, field: keyof ItemFormState, value: string) {
    setItemForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveItem(itemId: number) {
    setSaving(true);
    setError("");
    const it = localItems.find((i) => i.id === itemId);
    if (!it) { setSaving(false); return; }

    const payload = {
      payment_mode: paymentMode,
      security_payment_mode: securityPaymentMode,
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
      credentials: "same-origin",
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    applySaveResponse(data);
    if (data.status === "delivered") router.refresh();
  }

  async function saveAll(markDelivered = false) {
    setSaving(true);
    setError("");
    const pending = localItems.filter((it) => !it.isDelivered);
    if (!pending.length) { setSaving(false); return; }
    const payload = {
      payment_mode: paymentMode,
      security_payment_mode: securityPaymentMode,
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
      credentials: "same-origin",
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    applySaveResponse(data);
    if (data.status === "delivered") router.refresh();
  }

  function onIdPhotoChange(slot: 1 | 2, file: File | null) {
    if (slot === 1) {
      setIdPhoto1File(file);
      if (idPhoto1Preview) URL.revokeObjectURL(idPhoto1Preview);
      setIdPhoto1Preview(file ? URL.createObjectURL(file) : null);
    } else {
      setIdPhoto2File(file);
      if (idPhoto2Preview) URL.revokeObjectURL(idPhoto2Preview);
      setIdPhoto2Preview(file ? URL.createObjectURL(file) : null);
    }
    setIdPhotoMessage("");
  }

  async function saveIdPhotos() {
    if (!idPhoto1File && !idPhoto2File) {
      setIdPhotoMessage("Choose at least one photo to upload.");
      return;
    }
    setSavingIdPhotos(true);
    setIdPhotoMessage("");
    try {
      const form = new FormData();
      if (idPhoto1File) form.append("id_photo_1", idPhoto1File);
      if (idPhoto2File) form.append("id_photo_2", idPhoto2File);
      const res = await fetch(`/api/booking-delivery/${booking.id}/id-photos`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setIdPhotoMessage(data.error || "Failed to save ID photos");
        return;
      }
      if (data.id_photo_1) setSavedIdPhoto1(data.id_photo_1);
      if (data.id_photo_2) setSavedIdPhoto2(data.id_photo_2);
      setIdPhoto1File(null);
      setIdPhoto2File(null);
      if (idPhoto1Preview) URL.revokeObjectURL(idPhoto1Preview);
      if (idPhoto2Preview) URL.revokeObjectURL(idPhoto2Preview);
      setIdPhoto1Preview(null);
      setIdPhoto2Preview(null);
      setIdPhotoMessage("ID photos saved.");
      router.refresh();
    } finally {
      setSavingIdPhotos(false);
    }
  }

  return (
    <div>
      {allDelivered && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }} className="no-print">
          <Link
            href={`/booking/${booking.id}/delivery-slip`}
            className="btn btn-primary"
            style={{ background: "#1565c0", border: "none" }}
          >
            <i className="fa-solid fa-truck-fast" style={{ marginRight: 6 }} />
            View Delivery Slip
          </Link>
        </div>
      )}
      {allDelivered && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
          All dresses delivered. Scroll down to edit booking details if needed.
        </div>
      )}
      {!allDelivered && isDelivered && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
          Some dresses are not yet delivered. Mark each dress below — use the Delivery Slip button on each delivered dress.
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
          {warningItems.length <= 1 && <BookingItemWarningsSection items={warningItems} />}
        </div>
      </div>

      {nextBookings.length > 0 && !warningItems.some((w) => w.returning_warning || w.booked_warning) && (
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

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-id-card" style={{ marginRight: 8 }} />
            Customer ID Photos
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>(optional)</span>
          </h3>
        </div>
        <div className="card-body">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>
            Tap Open Camera to capture up to two ID photos at delivery. They appear on the return record and are removed automatically when the dress is returned.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {([1, 2] as const).map((slot) => {
              const preview = slot === 1 ? idPhoto1Preview : idPhoto2Preview;
              const saved = slot === 1 ? savedIdPhoto1 : savedIdPhoto2;
              return (
                <div key={slot}>
                  <label className="form-label">ID Photo {slot}</label>
                  <PhotoCaptureButton
                    label={`ID photo ${slot}`}
                    modalTitle={`Capture ID Photo ${slot}`}
                    previewUrl={preview}
                    savedUrl={saved ? photoUrl(saved) : null}
                    onCapture={(file) => onIdPhotoChange(slot, file)}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={savingIdPhotos || (!idPhoto1File && !idPhoto2File)}
              onClick={saveIdPhotos}
            >
              {savingIdPhotos ? "Saving…" : "Save ID Photos"}
            </button>
            {idPhotoMessage && (
              <span style={{ fontSize: 13, color: idPhotoMessage.includes("saved") ? "var(--success)" : "var(--text-muted)" }}>
                {idPhotoMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-truck-fast" style={{ marginRight: 8 }} />
            {hasMultiple ? "Deliver Each Dress" : "Delivery Details"}
          </h3>
        </div>
        <div className="card-body">
          {!allDelivered && (
            <div style={{ marginBottom: 16, padding: 16, background: "var(--cream-dark)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 16 }}>
              <PaymentModePicker
                value={paymentMode}
                onChange={setPaymentMode}
                label="Balance Payment Mode *"
                name="deliveryPaymentMode"
              />
              <PaymentModePicker
                value={securityPaymentMode}
                onChange={setSecurityPaymentMode}
                label="Security Deposit Payment Mode *"
                name="deliverySecurityPaymentMode"
              />
            </div>
          )}
          {localItems.map((it) => (
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

              {warningItems.length > 1 && (() => {
                const itemWarnings = findItemWarnings(warningItems, { itemId: it.itemId, dressName: it.dressName });
                return itemWarnings ? <BookingItemWarningsBlock item={itemWarnings} /> : null;
              })()}

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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditingDelivered((prev) => ({ ...prev, [it.id]: true }))}
                  >
                    <i className="fa-solid fa-pen" style={{ marginRight: 6 }} />
                    Edit Delivered Record
                  </button>
                  {partialDelivery && (
                    <Link
                      href={deliverySlipHref(booking.id, {
                        status: booking.status,
                        bookingItems: localItems.map((row) => ({
                          id: row.id,
                          isDelivered: row.isDelivered,
                        })),
                      }, it.id)}
                      className="btn btn-outline btn-sm"
                      style={{ color: "#1565c0", borderColor: "#1565c0" }}
                    >
                      <i className="fa-solid fa-truck-fast" style={{ marginRight: 6 }} />
                      Delivery Slip
                    </Link>
                  )}
                </div>
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
              {localItems.length > 0 && (
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
