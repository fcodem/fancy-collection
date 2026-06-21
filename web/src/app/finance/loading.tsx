export default function FinanceLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 24, width: 220, background: "var(--border-color)",
        borderRadius: 4, marginBottom: 16, opacity: 0.4 }} />
      <div style={{ height: 280, background: "var(--border-color)",
        borderRadius: 8, marginBottom: 16, opacity: 0.2 }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 36, background: "var(--border-color)",
          borderRadius: 4, marginBottom: 8, opacity: 0.15 }} />
      ))}
    </div>
  );
}
