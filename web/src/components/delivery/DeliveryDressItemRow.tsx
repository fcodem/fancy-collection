"use client";

import Link from "next/link";
import { memo } from "react";
import BookingItemWarningsBlock, {
  findItemWarnings,
} from "@/components/BookingItemWarningsSection";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";

export type DeliveryDressItem = {
  id: number;
  itemId?: number | null;
  dressName: string;
  category?: string | null;
  size?: string | null;
  price: number;
  remaining: number;
  advance?: number;
  photo?: string;
  isDelivered: boolean;
  isCancelled?: boolean;
  cancelRefundAmount?: number;
  preparedBy?: string;
  checkedBy?: string;
  packingNote?: string;
};

export type DeliveryDressItemForm = {
  remaining: string;
  security: string;
  notes: string;
};

type DeliveryDressItemRowProps = {
  item: DeliveryDressItem;
  selected: boolean;
  form: DeliveryDressItemForm | undefined;
  editing: boolean;
  cancelling: boolean;
  saving: boolean;
  cancelBusy: boolean;
  warningItems: ItemWarningSource[];
  showWarnings: boolean;
  partialDelivery: boolean;
  viewSlipHref: string | null;
  onToggleSelect: (id: number, selected: boolean) => void;
  onUpdateField: (id: number, field: keyof DeliveryDressItemForm, value: string) => void;
  onToggleCancelling: (id: number) => void;
  onCancelDress: (id: number, refunded: boolean) => void;
  onDismissCancel: () => void;
  onStartEdit: (id: number) => void;
  onSaveItem: (id: number) => void;
  onCancelEdit: (id: number) => void;
};

function DeliveryDressItemRow({
  item: it,
  selected,
  form,
  editing,
  cancelling,
  saving,
  cancelBusy,
  warningItems,
  showWarnings,
  partialDelivery,
  viewSlipHref,
  onToggleSelect,
  onUpdateField,
  onToggleCancelling,
  onCancelDress,
  onDismissCancel,
  onStartEdit,
  onSaveItem,
  onCancelEdit,
}: DeliveryDressItemRowProps) {
  return (
    <div
      style={{
        border: `1.5px solid ${
          it.isCancelled
            ? "rgba(192,57,43,0.45)"
            : it.isDelivered
              ? "var(--success)"
              : selected
                ? "#1565c0"
                : "var(--border)"
        }`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        background: it.isCancelled
          ? "rgba(192,57,43,0.05)"
          : it.isDelivered
            ? "rgba(46,125,50,0.04)"
            : selected
              ? "rgba(21,101,192,0.04)"
              : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        {!it.isDelivered && !it.isCancelled && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggleSelect(it.id, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
              Select
            </span>
          </label>
        )}
        {it.photo && (
          <img
            src={photoUrl(it.photo)}
            alt=""
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              objectFit: "cover",
              opacity: it.isCancelled ? 0.55 : 1,
            }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{it.dressName}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {it.category}
            {it.size ? ` · ${it.size}` : ""} · Rent ₹{formatInr(it.price)}
            {!it.isCancelled && <> · Remaining ₹{formatInr(it.remaining)}</>}
            {typeof it.advance === "number" && it.advance > 0 && (
              <> · Advance ₹{formatInr(it.advance)}</>
            )}
          </div>
        </div>
        {it.isCancelled ? (
          <span className="badge" style={{ background: "rgba(192,57,43,0.12)", color: "var(--danger)" }}>
            Cancelled{(it.cancelRefundAmount || 0) > 0 ? " · Refunded" : " · Not refunded"}
          </span>
        ) : it.isDelivered ? (
          <span className="badge badge-success">
            <i className="fa-solid fa-check" /> Delivered
          </span>
        ) : (
          <span className="badge badge-warning">Pending</span>
        )}
      </div>

      {it.isCancelled ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          This dress was cancelled
          {(it.cancelRefundAmount || 0) > 0
            ? ` and advance ₹${formatInr(it.cancelRefundAmount || it.advance || 0)} was refunded (subtracted from finance).`
            : " — advance was not refunded (kept in finance)."}
        </p>
      ) : (
        <>
          {(it.preparedBy || it.checkedBy || it.packingNote) && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                background: "var(--info-bg, #e8f4fd)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>PACKING INFO</strong>
              {it.preparedBy && <div>Prepared by: {it.preparedBy}</div>}
              {it.checkedBy && <div>Checked by: {it.checkedBy}</div>}
              {it.packingNote && <div>Note: {it.packingNote}</div>}
            </div>
          )}

          {showWarnings &&
            (() => {
              const itemWarnings = findItemWarnings(warningItems, {
                itemId: it.itemId,
                dressName: it.dressName,
              });
              return itemWarnings ? <BookingItemWarningsBlock item={itemWarnings} /> : null;
            })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label className="form-label">Remaining Collected (₹)</label>
              <input
                type="number"
                inputMode="numeric"
                className="form-control"
                value={form?.remaining ?? ""}
                onChange={(e) => onUpdateField(it.id, "remaining", e.target.value)}
                disabled={it.isDelivered && !editing}
              />
            </div>
            <div>
              <label className="form-label">Security Collected (₹)</label>
              <input
                type="number"
                inputMode="numeric"
                className="form-control"
                value={form?.security ?? ""}
                onChange={(e) => onUpdateField(it.id, "security", e.target.value)}
                disabled={it.isDelivered && !editing}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Delivery Notes</label>
            <textarea
              className="form-control"
              rows={2}
              value={form?.notes ?? ""}
              onChange={(e) => onUpdateField(it.id, "notes", e.target.value)}
              disabled={it.isDelivered && !editing}
              placeholder="Notes for this dress…"
            />
          </div>
          {!it.isDelivered && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={saving || cancelBusy}
                onClick={() => onToggleCancelling(it.id)}
                style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              >
                <i className="fa-solid fa-ban" style={{ marginRight: 6 }} />
                Cancel
              </button>
            </div>
          )}
          {cancelling && !it.isDelivered && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 10,
                border: "1.5px solid rgba(192,57,43,0.35)",
                background: "rgba(192,57,43,0.05)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--danger)" }}>
                Cancel {it.dressName}?
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
                Advance on this dress: ₹{formatInr(it.advance || 0)}. Choose whether that advance was
                refunded to the customer.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={cancelBusy}
                  onClick={() => onCancelDress(it.id, true)}
                >
                  Refunded
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={cancelBusy}
                  onClick={() => onCancelDress(it.id, false)}
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                >
                  Not Refunded
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={cancelBusy}
                  onClick={onDismissCancel}
                >
                  Back
                </button>
              </div>
            </div>
          )}
          {it.isDelivered && !editing && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-outline btn-sm" onClick={() => onStartEdit(it.id)}>
                <i className="fa-solid fa-pen" style={{ marginRight: 6 }} />
                Edit payment record
              </button>
              {partialDelivery && viewSlipHref && (
                <Link
                  href={viewSlipHref}
                  className="btn btn-outline btn-sm"
                  style={{ color: "#1565c0", borderColor: "#1565c0" }}
                >
                  <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }} />
                  View slip
                </Link>
              )}
            </div>
          )}
          {it.isDelivered && editing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={saving}
                onClick={() => onSaveItem(it.id)}
              >
                <i className="fa-solid fa-save" style={{ marginRight: 6 }} />
                Save Changes
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => onCancelEdit(it.id)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(DeliveryDressItemRow);
