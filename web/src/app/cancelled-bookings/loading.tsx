export default function RemainingToDeliverLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 220, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ height: 44, width: 40, background: "var(--border-color)", borderRadius: 4, opacity: 0.2, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 44, background: "var(--border-color)", borderRadius: 4, opacity: 0.18 }} />
        </div>
      ))}
    </div>
  );
}
