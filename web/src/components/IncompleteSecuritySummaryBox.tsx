import { formatInr } from "@/lib/format";
import type { IncompleteSecuritySummary } from "@/lib/bookingDetails";

export default function IncompleteSecuritySummaryBox({
  summary,
  compact = false,
}: {
  summary: IncompleteSecuritySummary;
  compact?: boolean;
}) {
  if (summary.totalSecurity <= 0 && summary.securityHeld <= 0) return null;

  return (
    <div
      style={{
        marginTop: compact ? 0 : 12,
        marginBottom: compact ? 0 : 12,
        padding: compact ? "10px 12px" : "14px 16px",
        borderRadius: 10,
        background: "rgba(21,101,192,0.06)",
        border: "1.5px solid rgba(21,101,192,0.2)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          fontWeight: 700,
          marginBottom: compact ? 8 : 10,
        }}
      >
        SECURITY SUMMARY
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: compact ? 10 : 14,
          fontSize: compact ? 12 : 13,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
            TOTAL SECURITY
          </div>
          <strong>₹{formatInr(summary.totalSecurity)}</strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
            SECURITY RETURNED
          </div>
          <strong style={{ color: "var(--success)" }}>₹{formatInr(summary.securityReturned)}</strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
            SECURITY HELD
          </div>
          <strong style={{ fontSize: compact ? 14 : 18, color: "#1565c0" }}>
            ₹{formatInr(summary.securityHeld)}
          </strong>
        </div>
      </div>
    </div>
  );
}
