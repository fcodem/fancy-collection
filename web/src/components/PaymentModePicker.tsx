"use client";

export type PaymentMode = "cash" | "online";

export default function PaymentModePicker({
  value,
  onChange,
  label = "Payment Mode *",
  name = "paymentMode",
}: {
  value: PaymentMode;
  onChange: (mode: PaymentMode) => void;
  label?: string;
  name?: string;
}) {
  return (
    <div className="form-group full-width" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name={name}
            value="cash"
            checked={value === "cash"}
            onChange={() => onChange("cash")}
          />
          Cash
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="radio"
            name={name}
            value="online"
            checked={value === "online"}
            onChange={() => onChange("online")}
          />
          Online
        </label>
      </div>
    </div>
  );
}
