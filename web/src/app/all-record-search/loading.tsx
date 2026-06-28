export default function AllRecordSearchLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 40, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.3 }} />
      <div style={{ height: 22, width: 180, background: "var(--border-color)", borderRadius: 4, marginBottom: 16, opacity: 0.35 }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 48, background: "var(--border-color)", borderRadius: 4, marginBottom: 8, opacity: 0.18 }} />
      ))}
    </div>
  );
}
