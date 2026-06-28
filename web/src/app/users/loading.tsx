export default function UsersLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 140, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div style={{ height: 36, width: 36, background: "var(--border-color)", borderRadius: "50%", opacity: 0.25, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 36, background: "var(--border-color)", borderRadius: 4, opacity: 0.18 }} />
        </div>
      ))}
    </div>
  );
}
