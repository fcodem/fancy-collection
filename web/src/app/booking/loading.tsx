export default function BookingLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ height: 24, width: 200, background: "var(--border-color)",
        borderRadius: 4, marginBottom: 16, opacity: 0.4 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ height: 48, background: "var(--border-color)",
          borderRadius: 4, marginBottom: 8, opacity: 0.2 }} />
      ))}
    </div>
  );
}
