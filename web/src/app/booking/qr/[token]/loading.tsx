export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 14,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div className="spinner" />
      <div style={{ fontSize: 15, fontWeight: 700 }}>QR scanned successfully</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Opening record…</div>
    </div>
  );
}
