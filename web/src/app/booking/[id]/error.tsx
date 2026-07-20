"use client";

export default function BookingRecordError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ padding: 24 }}>
        <h3 className="card-title" style={{ marginBottom: 8 }}>
          Something went wrong
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          {error.message || "This section failed to load."}
        </p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
