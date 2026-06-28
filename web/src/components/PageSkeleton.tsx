/** Instant loading placeholder for route segments (content area only). */
export default function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          height: 22,
          width: 200,
          background: "var(--border-color)",
          borderRadius: 4,
          marginBottom: 20,
          opacity: 0.45,
        }}
      />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: 44,
            background: "var(--border-color)",
            borderRadius: 4,
            marginBottom: 10,
            opacity: 0.18,
          }}
        />
      ))}
    </div>
  );
}
