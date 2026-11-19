import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import type { BookingWarningRecord } from "@/lib/bookingDetails";
import {
  WARNING_BOOKED_ON_RETURN,
  WARNING_RETURNING_ON_DELIVERY,
} from "@/lib/bookingDetails";
import { formatInr } from "@/lib/format";

function Field({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          opacity: 0.85,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, wordBreak: "break-word", lineHeight: 1.35 }}>
        {value}
      </div>
    </div>
  );
}

function CompleteRecordCard({
  w,
  variant,
  dressLabel,
}: {
  w: BookingWarningRecord;
  variant: "returning" | "booked";
  dressLabel?: string;
}) {
  const going = variant === "booked";
  const border = going ? "#c0392b" : "#e65100";
  const bg = going ? "#fff0ef" : "#fff7ed";
  const title = going ? "WHERE THIS DRESS IS GOING NEXT" : "WHERE THIS DRESS IS COMING FROM";
  const badge = going ? WARNING_BOOKED_ON_RETURN : WARNING_RETURNING_ON_DELIVERY;
  const serial = `#${String(w.serial_no).padStart(2, "0")}`;

  return (
    <div
      style={{
        border: `3px solid ${border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: bg,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          background: border,
          color: "#fff",
          padding: "12px 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            ⚠ ALTERNATE BOOKING · {title}
          </div>
          {dressLabel ? (
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, opacity: 0.95 }}>
              Dress: {dressLabel}
            </div>
          ) : null}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "8px 12px",
            textAlign: "right",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>{badge}</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{serial}</div>
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: border,
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Complete next booking record
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            color: "#1a1a1a",
          }}
        >
          <Field label="Customer" value={w.customer_name || "—"} />
          <Field label="Address" value={w.customer_address || ""} />
          <Field label="Contact" value={w.contact_1 || ""} />
          <Field label="WhatsApp" value={w.whatsapp_no || ""} />
          <Field label="Venue" value={w.venue || ""} />
          <Field label="Staff" value={w.staff_names || ""} />
          <Field
            label="Delivery"
            value={[w.delivery_date, w.delivery_time].filter(Boolean).join(" ")}
          />
          <Field
            label="Return"
            value={[w.return_date, w.return_time].filter(Boolean).join(" ")}
          />
          <Field label="Dresses" value={w.dress_names || ""} />
          <Field
            label="Advance"
            value={w.total_advance != null ? `₹${formatInr(w.total_advance)}` : ""}
          />
          <Field
            label="Total rent"
            value={w.total_rent != null ? `₹${formatInr(w.total_rent)}` : ""}
          />
          <Field label="Dress notes" value={w.item_notes || ""} />
          <Field label="Common note" value={w.common_notes || ""} />
        </div>
      </div>
    </div>
  );
}

/** Big alternate-booking warnings for delivery slip print — full next-booking record. */
export default function DeliverySlipAlternateWarnings({
  warnings,
}: {
  warnings?: ItemWarningSource[] | null;
}) {
  const withWarnings = (warnings || []).filter((w) => w.returning_warning || w.booked_warning);
  if (!withWarnings.length) return null;

  return (
    <div
      data-slip-section="alternate-warnings"
      className="no-break"
      style={{ padding: "0 16px 16px" }}
    >
      <div
        style={{
          background: "#1a1a1a",
          color: "#fff",
          padding: "10px 14px",
          borderRadius: 10,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Alternate booking warning — tell the customer
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, opacity: 0.92 }}>
          Same dress is linked to another booking. Return on time. Full record below.
        </div>
      </div>
      {withWarnings.map((item, idx) => {
        const label = item.display_name || item.dress_name;
        return (
          <div key={`${item.item_id ?? label ?? idx}`}>
            {item.returning_warning ? (
              <CompleteRecordCard
                w={item.returning_warning}
                variant="returning"
                dressLabel={label}
              />
            ) : null}
            {item.booked_warning ? (
              <CompleteRecordCard
                w={item.booked_warning}
                variant="booked"
                dressLabel={label}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
