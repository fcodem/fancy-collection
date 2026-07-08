import Link from "next/link";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        background: "linear-gradient(135deg, #3d0f24, #5A1433)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          fontSize: 28,
          fontWeight: 700,
        }}
        aria-hidden
      >
        !
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>You are offline</h1>
      <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.5, color: "rgba(255,255,255,0.85)" }}>
        Please reconnect to view the rental schedule.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 28,
          padding: "12px 24px",
          borderRadius: 10,
          background: "#fff",
          color: "#5A1433",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Try again
      </Link>
    </div>
  );
}
