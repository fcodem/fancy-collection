"use client";

import HealthScore from "@/components/dashboard/HealthScore";
import ExecBriefing from "@/components/dashboard/ExecBriefing";

/**
 * AI Mode dashboard. Read-only, owner/authorized-manager only.
 * Composition order: Business Health Score → AI Executive Briefing
 * (the briefing card includes the Owner KPI summary cards).
 */
export default function AiDashboard() {
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

      <HealthScore />
      <ExecBriefing />
    </div>
  );
}
