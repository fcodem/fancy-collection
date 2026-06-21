/** Instant feedback while a booking/inventory record page loads. */
export default function RecordLoadingSkeleton() {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ padding: 24 }}>
        <div
          style={{
            height: 14,
            width: "40%",
            borderRadius: 6,
            background: "var(--border)",
            marginBottom: 16,
          }}
        />
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 10,
              background: "var(--border)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, width: "70%", borderRadius: 6, background: "var(--border)", marginBottom: 10 }} />
            <div style={{ height: 12, width: "55%", borderRadius: 6, background: "var(--border)", marginBottom: 10 }} />
            <div style={{ height: 12, width: "45%", borderRadius: 6, background: "var(--border)" }} />
          </div>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>Loading record…</p>
      </div>
    </div>
  );
}
