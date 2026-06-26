"use client";

import { formatInr } from "@/lib/format";

export type ConflictWarningInfo = {
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

export type BookingDateCheckRow = {
  item_id: number;
  item_name: string;
  status:
    | "ok"
    | "hard_conflict"
    | "returning_warning"
    | "booked_on_return_warning"
    | "both_warnings";
  conflict?: ConflictWarningInfo;
  returning_warning?: ConflictWarningInfo | null;
  booked_on_return_warning?: ConflictWarningInfo | null;
};

function warnCustomer(w: ConflictWarningInfo) {
  return w.customer || w.customer_name || "—";
}

function warnContact(w: ConflictWarningInfo) {
  return w.contact || w.contact_1 || "";
}

function serialLabel(n: number) {
  return String(n).padStart(2, "0");
}

function WarningDetail({ w, variant }: { w: ConflictWarningInfo; variant: "returning" | "booked" | "conflict" }) {
  const isReturning = variant === "returning";
  return (
    <div style={{ marginTop: 4 }}>
      <i className={`fa-solid ${isReturning ? "fa-triangle-exclamation" : "fa-circle-exclamation"}`} style={{ marginRight: 6 }} />
      {isReturning ? "Returning on delivery date" : variant === "booked" ? "Booked on return date" : "Already booked"} —{" "}
      {warnCustomer(w)} · Serial #{serialLabel(w.serial_no)}
      {isReturning && w.return_time ? ` · by ${w.return_time}` : ""}
      {isReturning && w.return_date ? ` · Return ${w.return_date}` : ""}
      {!isReturning && w.delivery_time ? ` · Pickup ${w.delivery_time}` : ""}
      {!isReturning && w.delivery_date ? ` · Delivery ${w.delivery_date}` : ""}
      {variant === "conflict" && w.delivery_date && w.return_date ? ` · ${w.delivery_date} → ${w.return_date}` : ""}
      {w.total_rent ? ` · ₹${formatInr(w.total_rent)}` : ""}
      {w.venue ? ` · ${w.venue}` : ""}
      {warnContact(w) ? ` · ${warnContact(w)}` : ""}
    </div>
  );
}

/** Hard blocks + soft scheduling warnings (same rules as New/Edit Booking date-check). */
export default function BookingConflictSummary({
  results,
  loading = false,
  allowLabel = "saving is allowed",
  okLabel = "All dresses are available for these dates.",
}: {
  results: BookingDateCheckRow[];
  loading?: boolean;
  allowLabel?: string;
  okLabel?: string;
}) {
  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
          <i className="fa-solid fa-spinner fa-spin" /> Checking dress availability…
        </div>
      </div>
    );
  }

  const hardItems = results.filter((r) => r.status === "hard_conflict");
  const warnItems = results.filter((r) =>
    r.status === "returning_warning" || r.status === "booked_on_return_warning" || r.status === "both_warnings",
  );
  const okItems = results.filter((r) => r.status === "ok");

  if (!hardItems.length && !warnItems.length && !okItems.length) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {hardItems.map((item) => {
        const c = item.conflict!;
        return (
          <div
            key={`hard-${item.item_id}`}
            style={{ background: "#7b2d2d44", border: "1.5px solid #e53e3e", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fc8181", marginBottom: 8 }}>
              <i className="fa-solid fa-ban" style={{ marginRight: 8 }} />
              NOT ALLOWED — {item.item_name}
            </div>
            <WarningDetail w={c} variant="conflict" />
          </div>
        );
      })}

      {warnItems.length > 0 && (
        <div style={{ background: "#7b4a0044", border: "1.5px solid #ed8936", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fbd38d", marginBottom: 8 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
            WARNING — {warnItems.length} scheduling alert{warnItems.length > 1 ? "s" : ""} ({allowLabel})
          </div>
          <div style={{ fontSize: 12, color: "#fbd38d" }}>
            {warnItems.map((item) => (
              <div key={`warn-${item.item_id}`} style={{ padding: "6px 0", borderBottom: "1px solid #ed893633" }}>
                <strong>{item.item_name}</strong>
                {item.returning_warning && <WarningDetail w={item.returning_warning} variant="returning" />}
                {item.booked_on_return_warning && <WarningDetail w={item.booked_on_return_warning} variant="booked" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {okItems.length > 0 && !hardItems.length && !warnItems.length && (
        <div style={{ background: "#1a4731", border: "1.5px solid #38a169", borderRadius: 12, padding: "12px 20px" }}>
          <i className="fa-solid fa-circle-check" style={{ color: "#68d391", marginRight: 8 }} />
          <span style={{ fontSize: 13, color: "#68d391", fontWeight: 700 }}>{okLabel}</span>
        </div>
      )}
    </div>
  );
}
