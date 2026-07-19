"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function FinanceError({
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
      ? "This finance report could not be loaded. You can retry or return to the ledger."
      : error.message || "Finance report error";

  return (
    <div className="card" style={{ maxWidth: 560, margin: "24px auto" }}>
      <div className="card-body">
        <h3 style={{ marginTop: 0 }}>Finance report unavailable</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Retry
          </button>
          <Link href="/finance/ledger" className="btn btn-outline">
            Back to Ledger
          </Link>
        </div>
      </div>
    </div>
  );
}
