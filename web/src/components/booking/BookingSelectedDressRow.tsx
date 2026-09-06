"use client";

import { memo } from "react";
import { formatInr } from "@/lib/format";
import { preventInputWheel } from "@/lib/preventInputWheel";
import { bookingItemRemaining } from "@/lib/bookingLineTotals";
import BookingPhotoThumb from "@/components/BookingPhotoThumb";
import type { ProspectDressWarning } from "@/lib/prospectLeadWarning";

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
  fittingCharges: number;
  advance: number;
  notes: string;
};

type BookingSelectedDressRowProps = {
  dress: BookingSelectedDress;
  index: number;
  returningWarning?: DressWarning | null;
  bookedWarning?: DressWarning | null;
  prospectWarnings?: ProspectDressWarning[] | null;
  onRemove: (index: number) => void;
  onUpdateField: (index: number, field: "price" | "fittingCharges" | "advance" | "notes", value: string | number) => void;
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

function BookingSelectedDressRow({
  dress: d,
  index: i,
  returningWarning,
  bookedWarning,
  prospectWarnings,
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
        <BookingPhotoThumb
          photo={d.photo}
          size={64}
          alt={d.name}
        />

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

          {prospectWarnings?.map((pw) => (
            <div
              key={pw.prospect_lead_item_id}
              style={{
                fontSize: 11,
                color: "#6A1B9A",
                marginTop: 6,
                lineHeight: 1.4,
                padding: "6px 8px",
                background: "rgba(106, 27, 154, 0.06)",
                borderRadius: 8,
              }}
            >
              <strong>
                <i className="fa-solid fa-user-clock" /> Prospect lead
              </strong>
              {" — "}
              {pw.customer_name}
              {pw.contact_1 ? ` · ${pw.contact_1}` : ""}
              {pw.whatsapp_no ? ` · WA ${pw.whatsapp_no}` : ""}
              <br />
              {pw.customer_address ? <>Address: {pw.customer_address}<br /></> : null}
              Delivery {pw.delivery_date}
              {pw.delivery_time ? ` ${pw.delivery_time}` : ""} → Return {pw.return_date}
              {pw.return_time ? ` ${pw.return_time}` : ""}
              {pw.venue ? <> · Venue: {pw.venue}</> : null}
              {pw.staff_names ? <> · Staff: {pw.staff_names}</> : null}
              {pw.notes ? (
                <>
                  <br />
                  Notes: {pw.notes}
                </>
              ) : null}
              {pw.other_dresses.length ? (
                <>
                  <br />
                  Other dresses: {pw.other_dresses.join(", ")}
                </>
              ) : null}
              <br />
              <em>Will be removed from prospects after this booking is saved.</em>
            </div>
          ))}
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
            onWheel={preventInputWheel}
            onChange={(e) => onUpdateField(i, "price", Number(e.target.value))}
          />
        </div>

        <div>
          <label className="form-label">Fitting Charges (₹)</label>
          <input
            type="number"
            className="form-control"
            inputMode="numeric"
            value={d.fittingCharges}
            min={0}
            onWheel={preventInputWheel}
            onChange={(e) => onUpdateField(i, "fittingCharges", Number(e.target.value))}
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
            onWheel={preventInputWheel}
            onChange={(e) => onUpdateField(i, "advance", Number(e.target.value))}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
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
          ₹{formatInr(bookingItemRemaining(d.price, d.advance, d.fittingCharges))}
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
