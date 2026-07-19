"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function FinanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isChunkError =
      /loading chunk|failed to fetch|load failed|dynamically imported module/i.test(
        error.message || "",
      );
    if (isChunkError) {
      const key = "fc-finance-chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }
    console.error("[finance error boundary]", error);
  }, [error]);

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
