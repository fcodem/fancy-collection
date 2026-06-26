import type { ReactNode } from "react";
import { Fragment } from "react";
import { BookingNotesFromBooking } from "@/components/BookingNotesBlock";
import BookingItemWarningsBlock, { findItemWarnings } from "@/components/BookingItemWarningsSection";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { serializeRecordBookingDetails } from "@/lib/bookingDetails";
import type { BookingItemPricingRow } from "@/lib/dress";
import { serializeBookingItemRows } from "@/lib/dress";
import { formatInr } from "@/lib/format";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

const labelStyle = {
  fontSize: 11,
  color: "var(--text-muted)",
  fontWeight: 700,
  marginBottom: 2,
} as const;

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label.toUpperCase()}</div>
      <div style={{ wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

/** Standard booking record — customer, schedule, amounts, dress/common notes, optional item table. */
export function BookingRecordDetails({
  booking,
  items: itemsProp,
  showItemsTable = true,
  compact = false,
  remainingCollected,
  warningItems,
  extra,
}: {
  booking: BookingForStandardDetails;
  items?: BookingItemPricingRow[];
  showItemsTable?: boolean;
  compact?: boolean;
  /** When set, shows remaining due after partial collection. */
  remainingCollected?: number;
  /** Per-dress alternate booking warnings (shown under each dress row when multi-item). */
  warningItems?: ItemWarningSource[];
  extra?: ReactNode;
}) {
  const d = serializeRecordBookingDetails(booking);
  const items =
    itemsProp ??
    serializeBookingItemRows(booking as Parameters<typeof serializeBookingItemRows>[0]);
  const remDue =
    remainingCollected != null ? Math.max(0, d.total_remaining - remainingCollected) : null;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: compact
      ? "repeat(auto-fit, minmax(160px, 1fr))"
      : "repeat(auto-fit, minmax(180px, 1fr))",
    gap: compact ? 10 : 12,
    fontSize: 13,
  };

  return (
    <div className="booking-record-details">
      <div style={gridStyle}>
        <Field label="Customer" value={<strong>{d.customer_name}</strong>} />
        <Field label="Address" value={d.customer_address} />
        <Field label="Contact" value={d.contact1} />
        {d.whatsapp && (
          <Field
            label="WhatsApp"
            value={
              <span style={{ color: "#25D366" }}>
                <i className="fa-brands fa-whatsapp" style={{ marginRight: 4 }} aria-hidden />
                {d.whatsapp}
              </span>
            }
          />
        )}
        <Field label="Venue" value={d.venue} />
        <Field label="Delivery" value={`${d.delivery_date} ${d.delivery_time}`} />
        <Field label="Return" value={`${d.return_date} ${d.return_time}`} />
        <Field label="Dress" value={d.dress_names} />
        <Field label="Total Rent" value={<span style={{ fontWeight: 700, color: "var(--primary)" }}>₹{formatInr(d.total_rent)}</span>} />
        <Field label="Advance" value={<span style={{ color: "var(--success)", fontWeight: 600 }}>₹{formatInr(d.total_advance)}</span>} />
        <Field
          label="Remaining"
          value={
            d.total_remaining > 0 ? (
              <span style={{ fontWeight: 700, color: "var(--danger)" }}>₹{formatInr(d.total_remaining)}</span>
            ) : (
              <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>
            )
          }
        />
        {remDue != null && (
          <Field
            label="Balance Left to Collect"
            value={
              remDue > 0 ? (
                <span style={{ fontWeight: 700, color: "var(--danger)", fontSize: compact ? 14 : 16 }}>₹{formatInr(remDue)}</span>
              ) : (
                <span style={{ color: "var(--success)", fontWeight: 600 }}>Paid ✓</span>
              )
            }
          />
        )}
        {remainingCollected != null && remainingCollected > 0 && (
          <Field
            label="Collected at Delivery"
            value={<span style={{ color: "var(--success)", fontWeight: 600 }}>₹{formatInr(remainingCollected)}</span>}
          />
        )}
        <Field label="Security" value={`₹${formatInr(d.security_deposit)}`} />
      </div>

      <BookingNotesFromBooking booking={booking} compact={compact} style={{ marginTop: compact ? 8 : 12 }} />

      {showItemsTable && items.length > 0 && (
        <table className="data-table" style={{ marginTop: compact ? 12 : 16 }}>
          <thead>
            <tr>
              <th>Dress</th>
              <th>Price</th>
              <th>Advance</th>
              <th>Remaining</th>
              <th>Dress Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const dressWarnings = warningItems?.length
                ? findItemWarnings(warningItems, { dressName: item.display_name })
                : undefined;
              return (
                <Fragment key={i}>
                  <tr>
                    <td>{item.display_name}</td>
                    <td>₹{formatInr(item.price)}</td>
                    <td>₹{formatInr(item.advance)}</td>
                    <td>₹{formatInr(item.remaining)}</td>
                    <td style={{ fontSize: 12, wordBreak: "break-word" }}>{item.notes || "—"}</td>
                  </tr>
                  {dressWarnings && (
                    <tr>
                      <td colSpan={5} style={{ paddingTop: 0, paddingBottom: 12, borderTop: "none" }}>
                        <BookingItemWarningsBlock item={dressWarnings} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {extra}
    </div>
  );
}
