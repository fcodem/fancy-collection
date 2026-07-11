"use client";

import { useEffect, useState } from "react";
import HealthScore from "@/components/dashboard/HealthScore";
import ExecBriefing from "@/components/dashboard/ExecBriefing";
import { fetchJson } from "@/lib/fetchJson";

/**
 * AI Mode dashboard. Read-only, owner/authorized-manager only.
 * Composition order: Business Health Score → AI Executive Briefing
 * (the briefing card includes the Owner KPI summary cards).
 */
export default function AiDashboard() {
  const [metrics, setMetrics] = useState<{
    imagesEnhanced: number;
    pending: number;
    failed: number;
    averageProcessingTimeMs: number;
    successRate: number;
    apiUsageCalls: number;
    estimatedCostUsd: number;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<{ metrics: NonNullable<typeof metrics> }>("/api/admin/ai/metrics");
        setMetrics(data.metrics);
      } catch {
        setMetrics(null);
      }
    })();
  }, []);

  async function retryFailed() {
    setRetrying(true);
    try {
      await fetchJson("/api/admin/ai/enhancement/retry", { method: "POST" });
      const data = await fetchJson<{ metrics: NonNullable<typeof metrics> }>("/api/admin/ai/metrics");
      setMetrics(data.metrics);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="ai-dashboard">
      <div
        className="page-banner"
        style={{
          marginBottom: 20,
          background: "linear-gradient(135deg, #7B1F45, #C9A846)",
          borderRadius: "var(--radius)",
          padding: "16px 24px",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ width: 46, height: 46, background: "rgba(255,255,255,0.18)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          <i className="fa-solid fa-wand-magic-sparkles" />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>AI Mode</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>AI-enhanced, read-only business intelligence</div>
        </div>
      </div>

      {metrics ? (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong>AI Enhancement Operations</strong>
            <button className="btn" onClick={retryFailed} disabled={retrying}>
              {retrying ? "Retrying..." : "Retry Failed"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
            <div className="card" style={{ padding: 10 }}>Enhanced: <strong>{metrics.imagesEnhanced}</strong></div>
            <div className="card" style={{ padding: 10 }}>Pending: <strong>{metrics.pending}</strong></div>
            <div className="card" style={{ padding: 10 }}>Failed: <strong>{metrics.failed}</strong></div>
            <div className="card" style={{ padding: 10 }}>Success Rate: <strong>{metrics.successRate}%</strong></div>
            <div className="card" style={{ padding: 10 }}>Avg Time: <strong>{metrics.averageProcessingTimeMs} ms</strong></div>
            <div className="card" style={{ padding: 10 }}>API Calls: <strong>{metrics.apiUsageCalls}</strong></div>
            <div className="card" style={{ padding: 10 }}>Est. Cost: <strong>${metrics.estimatedCostUsd}</strong></div>
          </div>
        </div>
      ) : null}

      <HealthScore />
      <ExecBriefing />
    </div>
  );
}
