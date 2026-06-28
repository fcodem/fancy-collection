export default function SearchBookingLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 40, background: "var(--border-color)", borderRadius: 4, marginBottom: 20, opacity: 0.3 }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 56, background: "var(--border-color)", borderRadius: 4, marginBottom: 10, opacity: 0.18 }} />
      ))}
    </div>
  );
}
