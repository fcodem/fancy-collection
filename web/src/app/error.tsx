"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please refresh the page or contact support."
      : error.message;

  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <div className="brand-icon">⚠️</div>
          <h1>Something went wrong</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{message}</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn btn-primary btn-block"
            onClick={reset}>Try again</button>
          <a href="/" className="btn btn-outline btn-block"
            style={{ textAlign: "center" }}>Go home</a>
        </div>
      </div>
    </div>
  );
}
