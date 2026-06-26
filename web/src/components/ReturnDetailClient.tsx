"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import BookingItemWarningsBlock, {
  BookingItemWarningsSection,
  findItemWarnings,
} from "@/components/BookingItemWarningsSection";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import {
  balanceLeftToCollect,
  effectiveRemainingCollected,
  incompleteReturnSecuritySummary,
  securityCurrentlyHeld,
  type BookingForStandardDetails,
} from "@/lib/bookingDetails";
import type { BookingItemPricingRow } from "@/lib/dress";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";
import IncompleteSecuritySummaryBox from "@/components/IncompleteSecuritySummaryBox";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

type ItemDeliveryRow = {
  id: number;
  itemId?: number;
  dressName: string;
  category?: string | null;
  size?: string;
  photo?: string;
  isDelivered: boolean;
  isReturned?: boolean;
  isIncompleteReturn?: boolean;
  isPackedReady?: boolean;
  preparedBy?: string;
  checkedBy?: string;
  packingNote?: string;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
  itemIncompleteNotes?: string | null;
  itemIncompletePhoto?: string | null;
  itemSecurityHeld?: number;
};

type IncompleteDressForm = {
  selected: boolean;
  notes: string;
  securityHeld: string;
  photoFile: File | null;
  photoPreview: string | null;
};

function defaultIncompleteForm(row: ItemDeliveryRow, autoSelect: boolean): IncompleteDressForm {
  return {
    selected: autoSelect,
    notes: "",
    securityHeld: String(row.itemSecurityCollected || ""),
    photoFile: null,
    photoPreview: null,
  };
}

function isItemReturnable(row: ItemDeliveryRow, bookingDelivered: boolean) {
  if (row.isReturned) return false;
  return row.isDelivered || bookingDelivered;
}

function hasItemDeliveryInfo(d: ItemDeliveryRow) {
  return (
    d.isDelivered ||
    Boolean(d.itemDeliveryNotes?.trim()) ||
    d.itemRemainingCollected > 0 ||
    d.itemSecurityCollected > 0
  );
}

export default function ReturnDetailClient({
  booking,
  items,
  itemDelivery = [],
  warningItems = [],
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
    securityDeposit?: number;
    deliveryNotes?: string | null;
  };
  items: BookingItemPricingRow[];
  itemDelivery?: ItemDeliveryRow[];
  warningItems?: ItemWarningSource[];
}) {
  const router = useRouter();
  const allItemsDelivered = itemDelivery.length > 0 ? itemDelivery.every((d) => d.isDelivered) : false;
  const isDelivered = booking.status === "delivered" || (booking.status === "booked" && allItemsDelivered);
  const securityHeldAmount = securityCurrentlyHeld({
    status: booking.status,
    securityHeld: booking.securityHeld,
    securityCollected: booking.securityCollected,
    securityDeposit: booking.securityDeposit,
    items: itemDelivery,
    dressIsOut: isDelivered,
  });

  const bookingIsDelivered = booking.status === "delivered";
  const returnableItems = useMemo(
    () => itemDelivery.filter((d) => isItemReturnable(d, bookingIsDelivered)),
    [itemDelivery, bookingIsDelivered],
  );

  const deliveredItems = useMemo(
    () => itemDelivery.filter((d) => d.isDelivered || bookingIsDelivered),
    [itemDelivery, bookingIsDelivered],
  );
  const returnedItems = useMemo(
    () => deliveredItems.filter((d) => d.isReturned),
    [deliveredItems],
  );
  const pendingReturnCount = returnableItems.length;
  const multiDress = deliveredItems.length > 1;

  const [incompleteForms, setIncompleteForms] = useState<Record<number, IncompleteDressForm>>({});
  const [returnError, setReturnError] = useState("");

  useEffect(() => {
    setIncompleteForms((prev) => {
      const next: Record<number, IncompleteDressForm> = {};
      const autoSelect = returnableItems.length === 1;
      for (const row of returnableItems) {
        next[row.id] = prev[row.id] ?? defaultIncompleteForm(row, autoSelect);
      }
      return next;
    });
  }, [returnableItems]);
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [incompleteError, setIncompleteError] = useState("");

  const anyIncompleteSelected = returnableItems.some((r) => incompleteForms[r.id]?.selected);

  const totalPrice = booking.totalPrice ?? booking.price ?? 0;
  const totalAdvance = booking.totalAdvance ?? booking.advance ?? 0;
  const totalRemaining = booking.totalRemaining ?? booking.remaining ?? 0;
  const collectedAtDelivery = effectiveRemainingCollected(booking.remainingCollected, itemDelivery);
  const balanceLeft = balanceLeftToCollect(totalRemaining, collectedAtDelivery);

  const incompleteSecurity = incompleteReturnSecuritySummary({
    securityHeld: booking.securityHeld,
    securityCollected: booking.securityCollected,
    securityDeposit: booking.securityDeposit,
    items: itemDelivery,
  });

  function toggleIncompleteDress(id: number, selected: boolean) {
    setIncompleteForms((prev) => {
      const row = returnableItems.find((r) => r.id === id);
      const base = prev[id] ?? (row ? defaultIncompleteForm(row, false) : {
        selected: false,
        notes: "",
        securityHeld: "",
        photoFile: null,
        photoPreview: null,
      });
      return { ...prev, [id]: { ...base, selected } };
    });
    setIncompleteError("");
  }

  function updateIncompleteForm(id: number, patch: Partial<IncompleteDressForm>) {
    setIncompleteForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  function onIncompletePhotoChange(id: number, file: File | null) {
    setIncompleteForms((prev) => {
      const old = prev[id];
      if (old?.photoPreview) URL.revokeObjectURL(old.photoPreview);
      return {
        ...prev,
        [id]: {
          ...old,
          photoFile: file,
          photoPreview: file ? URL.createObjectURL(file) : null,
        },
      };
    });
  }

  async function act(action: string, bookingItemId?: number) {
    setReturnError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/return/${booking.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(bookingItemId ? { booking_item_id: bookingItemId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function submitIncompleteReturn() {
    if (returnableItems.length > 0 && !anyIncompleteSelected) {
      setIncompleteError("Select at least one dress for incomplete return.");
      return;
    }

    setIncompleteError("");
    setSaving(true);
    try {
      const form = new FormData();
      form.append("action", "incomplete_return");

      if (returnableItems.length === 1 && returnableItems[0].id === 0) {
        const f = incompleteForms[0];
        form.append("incomplete_notes", f?.notes || "");
        form.append("security_held", String(Number(f?.securityHeld) || 0));
        if (f?.photoFile) form.append("incomplete_photo", f.photoFile);
      } else {
        const items = returnableItems.map((row) => ({
          booking_item_id: row.id,
          is_incomplete: Boolean(incompleteForms[row.id]?.selected),
          incomplete_notes: incompleteForms[row.id]?.notes || "",
          security_held: Number(incompleteForms[row.id]?.securityHeld) || 0,
        }));
        form.append("items", JSON.stringify(items));
        for (const row of returnableItems) {
          const f = incompleteForms[row.id];
          if (f?.selected && f.photoFile) {
            form.append(`item_photo_${row.id}`, f.photoFile);
          }
        }
      }

      const res = await fetch(`/api/return/${booking.id}/save`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setIncompleteError(data.error || "Save failed");
        return;
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
            remainingCollected={collectedAtDelivery}
            warningItems={warningItems.length > 1 ? warningItems : undefined}
            extra={
            <>
              <div
                style={{
                  marginTop: 16,
                  marginBottom: 4,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: balanceLeft > 0 ? "rgba(192,57,43,0.07)" : "rgba(46,125,50,0.07)",
                  border: `1.5px solid ${balanceLeft > 0 ? "var(--danger)" : "var(--success)"}`,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 14,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                      TOTAL REMAINING (BOOKING)
                    </div>
                    <strong>₹{formatInr(totalRemaining)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                      COLLECTED AT DELIVERY
                    </div>
                    <strong style={{ color: "var(--success)" }}>₹{formatInr(collectedAtDelivery)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                      BALANCE LEFT TO COLLECT
                    </div>
                    <strong style={{ fontSize: 20, color: balanceLeft > 0 ? "var(--danger)" : "var(--success)" }}>
                      {balanceLeft > 0 ? `₹${formatInr(balanceLeft)}` : "Paid ✓"}
                    </strong>
                  </div>
                  {securityHeldAmount > 0 && booking.status !== "returned" && booking.status !== "cancelled" && (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                        SECURITY HELD
                      </div>
                      <strong style={{ fontSize: 18, color: "#1565c0" }}>₹{formatInr(securityHeldAmount)}</strong>
                    </div>
                  )}
                </div>
              </div>
              {securityHeldAmount > 0 && booking.status !== "returned" && booking.status !== "cancelled" && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      padding: "10px 14px",
                      background: "rgba(21,101,192,0.08)",
                      borderRadius: 8,
                      border: "1px solid rgba(21,101,192,0.25)",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>SECURITY HELD (UNTIL RETURN) </span>
                    <strong style={{ color: "#1565c0" }}>₹{formatInr(securityHeldAmount)}</strong>
                    {booking.securityCollected > 0 && (booking.securityDeposit ?? 0) > booking.securityCollected && (
                      <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                        (₹{formatInr(booking.securityCollected)} collected at delivery)
                      </span>
                    )}
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
                {itemDelivery.filter(hasItemDeliveryInfo).map((d, i) => (
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
                      <span
                        className={`badge ${
                          d.isReturned
                            ? "badge-success"
                            : d.isIncompleteReturn
                              ? "badge-incomplete_return"
                              : d.isDelivered
                                ? "badge-success"
                                : "badge-info"
                        }`}
                        style={{ marginLeft: "auto" }}
                      >
                        {d.isReturned
                          ? "Returned"
                          : d.isIncompleteReturn
                            ? "Incomplete"
                            : d.isDelivered
                              ? "Delivered"
                              : "Delivery Saved"}
                      </span>
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
                    {(d.itemRemainingCollected > 0 || d.itemSecurityCollected > 0) && (
                      <div style={{ fontSize: 12 }}>
                        {d.itemRemainingCollected > 0 && <span>Remaining collected ₹{formatInr(d.itemRemainingCollected)}</span>}
                        {d.itemRemainingCollected > 0 && d.itemSecurityCollected > 0 && <span> · </span>}
                        {d.itemSecurityCollected > 0 && <span>Security held ₹{formatInr(d.itemSecurityCollected)}</span>}
                      </div>
                    )}
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
          {warningItems.length <= 1 && <BookingItemWarningsSection items={warningItems} />}
        </div>
      </div>

      {isDelivered && booking.status !== "returned" && booking.status !== "cancelled" && booking.status !== "incomplete_return" && (
        <div className="card" style={{ overflow: "visible" }}>
          <div className="card-header"><h3 className="card-title">Mark Return</h3></div>
          <div className="card-body" style={{ overflow: "visible" }}>
            {returnError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>{returnError}</div>
            )}

            {multiDress && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {returnedItems.length > 0
                  ? `${returnedItems.length} of ${deliveredItems.length} dress${deliveredItems.length === 1 ? "" : "es"} returned — mark each remaining dress as it comes back.`
                  : `${deliveredItems.length} dresses on this booking — mark each one returned individually as they are received.`}
              </p>
            )}

            {multiDress && pendingReturnCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 12, fontSize: 14 }}>Return dress by dress</h4>
                {returnableItems.map((row) => {
                  const itemWarnings = findItemWarnings(warningItems, { itemId: row.itemId, dressName: row.dressName });
                  return (
                  <div
                    key={row.id}
                    style={{
                      marginBottom: 10,
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--cream-dark, #fafafa)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                    {row.photo && (
                      <img
                        src={photoUrl(row.photo)}
                        alt=""
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <strong>{row.dressName}</strong>
                      {(row.category || row.size) && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {[row.category, row.size].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={saving}
                      onClick={() => void act("mark_item_returned", row.id)}
                    >
                      <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                      Mark Returned
                    </button>
                    </div>
                    {itemWarnings && <BookingItemWarningsBlock item={itemWarnings} />}
                  </div>
                  );
                })}
              </div>
            )}

            {returnedItems.length > 0 && pendingReturnCount > 0 && (
              <div style={{ marginBottom: 16, fontSize: 13, color: "var(--success)" }}>
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                Already returned: {returnedItems.map((d) => d.dressName).join(", ")}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ marginRight: 12 }}
              disabled={saving || pendingReturnCount === 0}
              onClick={() => void act("mark_returned")}
            >
              <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
              {multiDress ? "Mark All Remaining Returned" : "Mark Returned (Complete)"}
            </button>

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <h4 style={{ marginBottom: 8 }}>
                <i className="fa-solid fa-circle-exclamation" style={{ color: "#f39c12", marginRight: 8 }} />
                Incomplete Return
              </h4>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Check each dress that is missing or damaged, then add notes, security held, and a photo below.
                {returnableItems.length === 1 ? " This dress is pre-selected." : ""}
              </p>

              {incompleteError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{incompleteError}</div>
              )}

              {returnableItems.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No delivered dresses pending return.</p>
              ) : (
                returnableItems.map((row) => {
                  const form = incompleteForms[row.id];
                  const selected = form?.selected ?? false;
                  return (
                    <div
                      key={row.id}
                      style={{
                        marginBottom: 14,
                        padding: "14px 16px",
                        border: `1.5px solid ${selected ? "#f39c12" : "var(--border)"}`,
                        borderRadius: 10,
                        background: selected ? "rgba(243,156,18,0.06)" : "var(--cream-dark, #fafafa)",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleIncompleteDress(row.id, e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: "#f39c12" }}
                        />
                        {row.photo && (
                          <img
                            src={photoUrl(row.photo)}
                            alt=""
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <strong>{row.dressName}</strong>
                          {(row.category || row.size) && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {[row.category, row.size].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <span className="badge badge-warning">Mark incomplete</span>
                      </label>

                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(243,156,18,0.4)" }}>
                        <div style={{ marginBottom: 12 }}>
                          <label className="form-label">What is missing / notes for this dress</label>
                          <textarea
                            className="form-control"
                            rows={2}
                            value={form?.notes ?? ""}
                            onChange={(e) => updateIncompleteForm(row.id, { notes: e.target.value })}
                            placeholder="e.g. Dupatta missing, dress damaged…"
                            disabled={!selected}
                          />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label className="form-label">Security to hold for this dress (₹)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={form?.securityHeld ?? ""}
                            onChange={(e) => updateIncompleteForm(row.id, { securityHeld: e.target.value })}
                            min={0}
                            step="0.01"
                            disabled={!selected}
                          />
                        </div>
                        <div>
                          <label className="form-label">
                            Photo <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
                          </label>
                          {selected ? (
                            <PhotoCaptureButton
                              label={`Incomplete photo — ${row.dressName}`}
                              modalTitle={`Capture photo — ${row.dressName}`}
                              previewUrl={form?.photoPreview}
                              onCapture={(file) => onIncompletePhotoChange(row.id, file)}
                              emptyHeight={100}
                            />
                          ) : (
                            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                              Check the dress above to enable photo capture.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <button
                type="button"
                className="btn btn-outline"
                style={{ marginTop: 8, borderColor: "#f39c12", color: "#e67e22" }}
                disabled={saving || (returnableItems.length > 0 && !anyIncompleteSelected)}
                onClick={() => void submitIncompleteReturn()}
              >
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
                {saving ? "Saving…" : "Mark Incomplete Return"}
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

            <IncompleteSecuritySummaryBox summary={incompleteSecurity} />

            {itemDelivery.filter((d) => d.isIncompleteReturn).length > 0 ? (
              itemDelivery
                .filter((d) => d.isIncompleteReturn)
                .map((d, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 14,
                      padding: "12px 14px",
                      border: "1px solid rgba(243,156,18,0.35)",
                      borderRadius: 8,
                      background: "rgba(243,156,18,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {d.photo && (
                        <img src={photoUrl(d.photo)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                      )}
                      <strong>{d.dressName}</strong>
                      <span className="badge badge-incomplete_return" style={{ marginLeft: "auto" }}>Incomplete</span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Notes:</strong> {d.itemIncompleteNotes || booking.incompleteNotes || "—"}
                    </p>
                    {(d.itemSecurityCollected ?? 0) > 0 && (
                      <p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-muted)" }}>
                        Security collected at delivery: ₹{formatInr(d.itemSecurityCollected || 0)}
                      </p>
                    )}
                    {(d.itemSecurityHeld ?? 0) > 0 && (
                      <p style={{ margin: "4px 0", fontSize: 13 }}>
                        <strong>Security held:</strong> ₹{formatInr(d.itemSecurityHeld || 0)}
                      </p>
                    )}
                    {d.itemIncompletePhoto && (
                      <a href={photoUrl(d.itemIncompletePhoto)} target="_blank" rel="noreferrer">
                        <img
                          src={photoUrl(d.itemIncompletePhoto)}
                          alt="Incomplete"
                          style={{ marginTop: 8, maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                      </a>
                    )}
                  </div>
                ))
            ) : (
              <>
                <p><strong>Missing Items:</strong> {booking.incompleteNotes || "—"}</p>
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
              </>
            )}
            {itemDelivery.some((d) => d.isReturned && d.isDelivered) && (
              <p style={{ fontSize: 13, color: "var(--success)", marginTop: 12 }}>
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                Other dress(es) in this booking were returned completely.
              </p>
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
