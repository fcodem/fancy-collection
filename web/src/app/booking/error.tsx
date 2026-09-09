"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function BookingPanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[booking panel]", error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "production"
      ? "Could not load the booking panel. Try again, or open a different month."
      : error.message;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-body" style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ margin: "0 0 8px", color: "var(--primary)" }}>Booking panel error</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/booking?month=all" className="btn btn-outline">
            All months
          </Link>
          <Link href="/" className="btn btn-outline">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
