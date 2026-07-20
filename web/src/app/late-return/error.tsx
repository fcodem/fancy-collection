"use client";

export default function LateReturnError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
        <h3 style={{ color: "var(--danger)", marginBottom: 12 }}>Could not load late returns</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{error.message || "Something went wrong."}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
