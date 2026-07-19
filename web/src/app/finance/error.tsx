"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function FinanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Auto-retry once on chunk load errors (stale PWA cache after deploy)
    const isChunkError =
      /loading chunk|failed to fetch|load failed|dynamically imported module/i.test(
        error.message || "",
      );
    if (isChunkError && retryCount === 0) {
      setRetryCount(1);
      // Force reload the page to clear stale chunks
      window.location.reload();
      return;
    }
    console.error("[finance error boundary]", error);
  }, [error, retryCount]);

  const message =
    "This finance report could not be loaded. You can retry or return to the ledger.";

  return (
    <div className="card" style={{ maxWidth: 560, margin: "24px auto" }}>
      <div className="card-body">
        <h3 style={{ marginTop: 0 }}>Finance report unavailable</h3>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              reset();
              window.location.reload();
            }}
          >
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
