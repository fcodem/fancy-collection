export default function FreeItemsLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 160, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 32, width: 90, background: "var(--border-color)", borderRadius: 4, opacity: 0.28 }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{ height: 40, width: 40, background: "var(--border-color)", borderRadius: 4, opacity: 0.22, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 40, background: "var(--border-color)", borderRadius: 4, opacity: 0.18 }} />
        </div>
      ))}
    </div>
  );
}
