"use client";

export default function BookingListError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error.message || "Failed to load booked items."}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
