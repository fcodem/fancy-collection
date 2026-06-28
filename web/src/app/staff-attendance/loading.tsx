export default function StaffAttendanceLoading() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ height: 32, width: 120, background: "var(--border-color)", borderRadius: 4, opacity: 0.35 }} />
        <div style={{ height: 32, width: 100, background: "var(--border-color)", borderRadius: 4, opacity: 0.25 }} />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: 44, background: "var(--border-color)", borderRadius: 4, marginBottom: 10, opacity: 0.18 }} />
      ))}
    </div>
  );
}
