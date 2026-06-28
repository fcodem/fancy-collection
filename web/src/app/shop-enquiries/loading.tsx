export default function ShopEnquiriesLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 22, width: 180, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.45 }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 48, background: "var(--border-color)", borderRadius: 4, marginBottom: 10, opacity: 0.18 }} />
      ))}
    </div>
  );
}
