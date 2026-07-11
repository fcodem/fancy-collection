import type { ReactNode } from "react";
import { formatInr } from "@/lib/format";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import StarBookingBadge from "@/components/StarBookingBadge";
import {
  WARNING_BOOKED_ON_RETURN,
  WARNING_RETURNING_ON_DELIVERY,
  type BookingWarningRecord,
} from "@/lib/bookingDetails";

function Dash({ value }: { value?: string | number | null }) {
  if (value === undefined || value === null || value === "") {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return <>{value}</>;
}

function NoteCell({ text }: { text?: string }) {
  if (!text?.trim()) return <Dash value="" />;
  return (
    <span style={{ fontSize: 12, wordBreak: "break-word", overflowWrap: "anywhere", display: "block" }}>
      {text}
    </span>
  );
}

/** Table header row cells for the standard booking detail columns. */
export function StandardBookingTableHead() {
  return (
    <>
      <th className="booking-col-customer">Customer</th>
      <th className="booking-col-address">Address</th>
      <th className="booking-col-money">Total Rent</th>
      <th className="booking-col-money">Security</th>
      <th className="booking-col-dress">Dress</th>
      <th className="booking-col-notes">Dress Notes</th>
      <th className="booking-col-notes">Common Note</th>
      <th className="booking-col-date">Delivery</th>
      <th className="booking-col-date">Return</th>
    </>
  );
}

function customerCell(d: StandardBookingDetails) {
  return (
    <td className="booking-col-customer">
      <div style={{ fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center" }}>
        {d.customer_name}
        {d.is_star && <StarBookingBadge />}
      </div>
      {d.booking_date ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          <i className="fa-solid fa-calendar-plus" style={{ marginRight: 4, color: "var(--primary)" }} />
          Booked {d.booking_date}
          {d.booking_time ? ` ${d.booking_time}` : ""}
        </div>
      ) : null}
    </td>
  );
}

/** Table body cells for the standard booking detail columns. */
export function StandardBookingTableCells({ d }: { d: StandardBookingDetails }) {
  return (
    <>
      {customerCell(d)}
      <td className="booking-col-address">
        <NoteCell text={d.customer_address} />
      </td>
      <td className="booking-col-money" style={{ fontWeight: 700, color: "var(--primary)" }}>
        ₹{formatInr(d.total_rent)}
      </td>
      <td className="booking-col-money">₹{formatInr(d.security_deposit)}</td>
      <td className="booking-col-dress">
        <NoteCell text={d.dress_names} />
      </td>
      <td className="booking-col-notes">
        <NoteCell text={d.item_notes} />
      </td>
      <td className="booking-col-notes">
        <NoteCell text={d.common_notes} />
      </td>
      <td className="booking-col-date" style={{ fontSize: 12 }}>
        <div>{d.delivery_date}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.delivery_time}</div>
      </td>
      <td className="booking-col-date" style={{ fontSize: 12 }}>
        <div>{d.return_date}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.return_time}</div>
      </td>
    </>
  );
}

function customerWithStar(d: StandardBookingDetails) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {d.customer_name}
      {d.is_star && <StarBookingBadge />}
    </span>
  );
}

/** Compact grid for card layouts (returning today, packing list header, etc.). */
export function StandardBookingDetailsGrid({ d }: { d: StandardBookingDetails }) {
  const fields: Array<{ label: string; value: ReactNode }> = [
    { label: "Customer", value: customerWithStar(d) },
    {
      label: "Booked On",
      value: d.booking_date ? `${d.booking_date} ${d.booking_time}` : "—",
    },
    { label: "Address", value: d.customer_address || "—" },
    { label: "Total Rent", value: `₹${formatInr(d.total_rent)}` },
    { label: "Security", value: `₹${formatInr(d.security_deposit)}` },
    { label: "Dress", value: d.dress_names || "—" },
    { label: "Dress Notes", value: d.item_notes || "—" },
    { label: "Common Note", value: d.common_notes || "—" },
    {
      label: "Delivery",
      value: `${d.delivery_date} ${d.delivery_time}`,
    },
    {
      label: "Return",
      value: `${d.return_date} ${d.return_time}`,
    },
  ];

  return (
    <div
      className="standard-booking-details-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        fontSize: 13,
      }}
    >
      {fields.map((f) => (
        <div key={f.label}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 2 }}>
            {f.label.toUpperCase()}
          </div>
          <div style={{ wordBreak: "break-word" }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Packing list — all booking details except remaining balance and security deposit. */
export type PackingBookingExtras = {
  contact_1?: string;
  whatsapp_no?: string;
  venue?: string;
  staff_names?: string;
  total_advance?: number;
};

export function PackingBookingDetailsGrid({
  d,
  extras,
}: {
  d: StandardBookingDetails;
  extras?: PackingBookingExtras;
}) {
  const fields: Array<{ label: string; value: ReactNode }> = [
    { label: "Customer", value: customerWithStar(d) },
    {
      label: "Booked On",
      value: d.booking_date ? `${d.booking_date} ${d.booking_time}` : "—",
    },
    { label: "Address", value: d.customer_address || "—" },
    { label: "Contact", value: extras?.contact_1 || "—" },
    {
      label: "WhatsApp",
      value: extras?.whatsapp_no ? (
        <span style={{ color: "#25D366" }}>
          <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
          {extras.whatsapp_no}
        </span>
      ) : (
        "—"
      ),
    },
    { label: "Venue", value: extras?.venue || "—" },
    { label: "Staff", value: extras?.staff_names || "—" },
    { label: "Total Rent", value: `₹${formatInr(d.total_rent)}` },
    { label: "Advance Paid", value: `₹${formatInr(extras?.total_advance ?? 0)}` },
    { label: "Dress", value: d.dress_names || "—" },
    { label: "Dress Notes", value: d.item_notes || "—" },
    { label: "Common Note", value: d.common_notes || "—" },
    { label: "Delivery", value: `${d.delivery_date} ${d.delivery_time}` },
    { label: "Return", value: `${d.return_date} ${d.return_time}` },
  ];

  return (
    <div className="packing-details-fit">
      {fields.map((f) => (
        <div key={f.label} className="packing-detail-field">
          <div className="packing-detail-label">{f.label}</div>
          <div className="packing-detail-value">{f.value}</div>
        </div>
      ))}
    </div>
  );
}

export type PackingReturningWarning = BookingWarningRecord;

export function BookingWarningPanel({
  w,
  variant,
}: {
  w: BookingWarningRecord;
  variant: "returning" | "booked";
}) {
  const isReturning = variant === "returning";
  return (
    <div className={`packing-returning-warning ${isReturning ? "booking-warning--returning" : "booking-warning--booked"}`}>
      <div className="packing-warning-badge" style={isReturning ? undefined : { background: "rgba(192,57,43,0.12)", color: "var(--danger)" }}>
        <i className={`fa-solid ${isReturning ? "fa-triangle-exclamation" : "fa-circle-exclamation"}`} style={{ marginRight: 6 }} />
        <span>{isReturning ? WARNING_RETURNING_ON_DELIVERY : WARNING_BOOKED_ON_RETURN}</span>
        <strong style={{ marginLeft: 6 }}>#{String(w.serial_no).padStart(2, "0")}</strong>
      </div>
      <PackingBookingDetailsGrid
        d={{
          customer_name: w.customer_name,
          customer_address: w.customer_address || "",
          total_rent: w.total_rent || 0,
          security_deposit: 0,
          dress_names: w.dress_names || "",
          item_notes: w.item_notes || "",
          common_notes: w.common_notes || "",
          booking_date: w.booking_date || "",
          booking_time: w.booking_time || "",
          delivery_date: w.delivery_date || "",
          delivery_time: w.delivery_time || "",
          return_date: w.return_date || "",
          return_time: w.return_time || "",
        }}
        extras={{
          contact_1: w.contact_1,
          whatsapp_no: w.whatsapp_no,
          venue: w.venue,
          staff_names: w.staff_names,
          total_advance: w.total_advance,
        }}
      />
    </div>
  );
}

export function PackingReturningWarningPanel({ w }: { w: PackingReturningWarning }) {
  return <BookingWarningPanel w={w} variant="returning" />;
}

/** Delivery/return/booking dates shown in card headers (booked items, packing list, etc.). */
export function BookingCardHeaderDates({
  d,
}: {
  d: Pick<
    StandardBookingDetails,
    "booking_date" | "booking_time" | "delivery_date" | "delivery_time" | "return_date" | "return_time"
  >;
}) {
  return (
    <div className="booking-card-header-dates">
      <div>
        <i className="fa-solid fa-truck" style={{ marginRight: 4, color: "var(--primary)" }} />
        {d.delivery_date} {d.delivery_time}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        <i className="fa-solid fa-rotate-left" style={{ marginRight: 4 }} />
        {d.return_date} {d.return_time}
      </div>
    </div>
  );
}
