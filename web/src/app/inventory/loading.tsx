export default function InventoryLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 24, width: 180, background: "var(--border-color)",
        borderRadius: 4, marginBottom: 16, opacity: 0.4 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 32, width: 80, background: "var(--border-color)",
            borderRadius: 4, opacity: 0.3 }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{ height: 40, width: 40, background: "var(--border-color)",
            borderRadius: 4, opacity: 0.25, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 40, background: "var(--border-color)",
            borderRadius: 4, opacity: 0.2 }} />
        </div>
      ))}
    </div>
  );
}
