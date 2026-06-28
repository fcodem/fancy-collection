export default function ManageCategoriesLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 200, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 32, width: 80, background: "var(--border-color)", borderRadius: 4, opacity: 0.28 }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ height: 40, background: "var(--border-color)", borderRadius: 4, marginBottom: 8, opacity: 0.18 }} />
      ))}
    </div>
  );
}
