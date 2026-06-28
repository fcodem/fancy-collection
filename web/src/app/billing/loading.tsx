export default function BillingLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 140, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 60, background: "var(--border-color)", borderRadius: 4, marginBottom: 12, opacity: 0.18 }} />
      ))}
    </div>
  );
}
