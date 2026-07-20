"use client";

import { memo } from "react";
import { formatInr } from "@/lib/format";
import { photoUrl } from "@/lib/photoUrl";

type DressWarning = {
  customer?: string;
  customer_name?: string;
  serial_no: number;
  total_rent?: number;
  venue?: string;
  return_time?: string;
  delivery_time?: string;
  return_date?: string;
  delivery_date?: string;
  contact?: string;
  contact_1?: string;
};

export type BookingSelectedDress = {
  id: number | null;
  name: string;
  category: string;
  size: string;
  color?: string;
  photo: string;
  price: number;
  advance: number;
  notes: string;
};

type BookingSelectedDressRowProps = {
  dress: BookingSelectedDress;
  index: number;
  returningWarning?: DressWarning | null;
  bookedWarning?: DressWarning | null;
  onRemove: (index: number) => void;
  onUpdateField: (index: number, field: "price" | "advance" | "notes", value: string | number) => void;
};

function warnCustomer(w: DressWarning) {
  return w.customer || w.customer_name || "—";
}

function warnContact(w: DressWarning) {
  return w.contact || w.contact_1 || "";
}

function formatReturningWarning(w: DressWarning) {
  return (
    <>
      <strong>Returning on the date of delivery</strong> · {warnCustomer(w)} · Serial #
      {String(w.serial_no).padStart(2, "0")}
      {w.return_time ? ` · by ${w.return_time}` : ""}
      {w.return_date ? ` · Return ${w.return_date}` : ""}
      {w.total_rent ? ` · ₹${formatInr(w.total_rent)}` : ""}
      {w.venue ? ` · ${w.venue}` : ""}
      {warnContact(w) ? ` · ${warnContact(w)}` : ""}
    </>
  );
}

function formatBookedWarning(w: DressWarning) {
  return (
    <>
      <strong>Booked on the return date</strong> · {warnCustomer(w)} · Serial #
      {String(w.serial_no).padStart(2, "0")}
      {w.delivery_time ? ` · Pickup ${w.delivery_time}` : ""}
      {w.delivery_date ? ` · Delivery ${w.delivery_date}` : ""}
      {w.total_rent ? ` · ₹${formatInr(w.total_rent)}` : ""}
      {w.venue ? ` · ${w.venue}` : ""}
      {warnContact(w) ? ` · ${warnContact(w)}` : ""}
    </>
  );
}

function PhotoThumb({ photo, size = 44 }: { photo?: string; size?: number }) {
  const src = photoUrl(photo);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: "linear-gradient(135deg, var(--cream-dark), var(--cream))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        flexShrink: 0,
      }}
    >
      👗
    </div>
  );
}

function BookingSelectedDressRow({
  dress: d,
  index: i,
  returningWarning,
  bookedWarning,
  onRemove,
  onUpdateField,
}: BookingSelectedDressRowProps) {
  return (
    <div
      style={{
        border: "1.5px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        background: "linear-gradient(135deg, rgba(123,31,69,0.02), rgba(201,168,70,0.02))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <PhotoThumb photo={d.photo} size={56} />

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>{d.name}</div>

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {d.category}
            {d.size ? ` · ${d.size}` : ""}
            {d.color ? ` · ${d.color}` : ""}
          </div>

          {returningWarning && (
            <div style={{ fontSize: 10, color: "#E65100", marginTop: 4, lineHeight: 1.3 }}>
              <i className="fa-solid fa-triangle-exclamation" /> {formatReturningWarning(returningWarning)}
            </div>
          )}

          {bookedWarning && (
            <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 4, lineHeight: 1.3 }}>
              <i className="fa-solid fa-circle-exclamation" /> {formatBookedWarning(bookedWarning)}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(i)}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      <div className="payment-grid-3" style={{ marginBottom: 12 }}>
        <div>
          <label className="form-label">Rental Price (₹)</label>
          <input
            type="number"
            className="form-control"
            inputMode="numeric"
            value={d.price}
            min={0}
            onChange={(e) => onUpdateField(i, "price", Number(e.target.value))}
          />
        </div>

        <div>
          <label className="form-label">Advance Paid (₹)</label>
          <input
            type="number"
            className="form-control"
            inputMode="numeric"
            value={d.advance}
            min={0}
            onChange={(e) => onUpdateField(i, "advance", Number(e.target.value))}
          />
        </div>

        <div>
          <label className="form-label">Remaining</label>
          <div
            style={{
              padding: "8px 12px",
              background: "var(--danger-bg)",
              borderRadius: 8,
              textAlign: "center",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--danger)",
            }}
          >
            ₹{formatInr(Math.max(0, d.price - d.advance))}
          </div>
        </div>
      </div>

      <div>
        <label className="form-label">Notes for {d.name}</label>
        <textarea
          className="form-control"
          rows={1}
          value={d.notes}
          onChange={(e) => onUpdateField(i, "notes", e.target.value)}
          placeholder="Special notes for this dress…"
        />
      </div>
    </div>
  );
}

export default memo(BookingSelectedDressRow);
