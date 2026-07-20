/** Instant skeleton for booking record navigation. */
export default function BookingRecordLoadingSkeleton() {
  return (
    <div>
      <div
        className="no-print"
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 40,
              width: i === 1 ? 72 : 120,
              borderRadius: 8,
              background: "var(--border)",
            }}
          />
        ))}
      </div>
      <div className="card">
        <div className="card-header" style={{ padding: 20 }}>
          <div
            style={{
              height: 22,
              width: "35%",
              borderRadius: 6,
              background: "var(--border)",
              marginBottom: 12,
            }}
          />
          <div style={{ height: 14, width: "25%", borderRadius: 6, background: "var(--border)" }} />
        </div>
        <div className="card-body" style={{ padding: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div style={{ height: 10, width: "50%", background: "var(--border)", borderRadius: 4, marginBottom: 6 }} />
                <div style={{ height: 14, width: "80%", background: "var(--border)", borderRadius: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ height: 12, width: "40%", background: "var(--border)", borderRadius: 4, marginBottom: 10 }} />
          <div style={{ height: 56, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
          <div style={{ height: 56, background: "var(--border)", borderRadius: 8, opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}
