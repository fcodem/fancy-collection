"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import DashboardRetryButton from "@/components/DashboardRetryButton";

const AUTO_RETRY_KEY = "dashboard-essential-auto-retry";

/** Shown when today's counts could not be read; retries once automatically per page visit. */
export default function DashboardEssentialFallback() {
  const router = useRouter();
  const scheduled = useRef(false);

  useEffect(() => {
    if (scheduled.current) return;
    scheduled.current = true;
    const last = Number(sessionStorage.getItem(AUTO_RETRY_KEY) || 0);
    if (Date.now() - last < 60_000) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(AUTO_RETRY_KEY, String(Date.now()));
      router.refresh();
    }, 3_000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="card mb-24">
      <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong>Today&apos;s delivery &amp; return cards</strong>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>
            The database is responding slowly. Retrying…
          </p>
        </div>
        <DashboardRetryButton />
      </div>
    </div>
  );
}
