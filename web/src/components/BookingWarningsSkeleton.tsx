/** Placeholder while alternate-booking warnings load. */
export default function BookingWarningsSkeleton() {
  return (
    <div
      className="booking-warnings-section"
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid var(--border)",
      }}
      aria-busy="true"
      aria-label="Loading booking warnings"
    >
      <div
        style={{
          height: 14,
          width: "55%",
          borderRadius: 6,
          background: "var(--border)",
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 48,
          borderRadius: 8,
          background: "var(--border)",
          opacity: 0.7,
        }}
      />
    </div>
  );
}
