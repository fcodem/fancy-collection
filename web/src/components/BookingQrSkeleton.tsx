export default function BookingQrSkeleton({ size = 140 }: { size?: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--border)",
        }}
      />
      <div
        style={{
          height: 10,
          width: size,
          margin: "8px auto 0",
          borderRadius: 4,
          background: "var(--border)",
        }}
      />
    </div>
  );
}
