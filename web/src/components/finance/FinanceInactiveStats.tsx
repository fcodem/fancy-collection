import { formatInr } from "@/lib/format";

export type InactiveBookingDisplay = {
  cancelled_count?: number;
  cancelled_amount?: number;
  cancelled_advance_refunded?: number;
  cancelled_advance_not_returned?: number;
  postponed_count?: number;
  postponed_amount?: number;
};

export function FinanceInactiveStats({ data }: { data: InactiveBookingDisplay }) {
  const hasAdvanceBreakdown =
    data.cancelled_advance_refunded != null || data.cancelled_advance_not_returned != null;

  return (
    <div className="stats-grid" style={{ marginTop: 8, marginBottom: 20 }}>
      <div className="stat-card danger" style={{ padding: 18 }}>
        <div className="stat-value">{data.cancelled_count ?? 0}</div>
        <div className="stat-label">Bookings Cancelled</div>
        {hasAdvanceBreakdown ? (
          <>
            <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
              ₹{formatInr(data.cancelled_advance_refunded ?? 0)} refunded
            </div>
            <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
              ₹{formatInr(data.cancelled_advance_not_returned ?? 0)} advance kept
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
              ₹{formatInr(data.cancelled_amount ?? 0)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Total booking value</div>
          </>
        )}
      </div>
      <div className="stat-card warning" style={{ padding: 18 }}>
        <div className="stat-value">{data.postponed_count ?? 0}</div>
        <div className="stat-label">Bookings Postponed</div>
        <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
          ₹{formatInr(data.postponed_amount ?? 0)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Advance postponed</div>
      </div>
    </div>
  );
}
