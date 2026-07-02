"use client";

import { formatInr } from "@/lib/format";

/**
 * Prominent breakdown of custom-order money for a finance report.
 * Reads order_advance / order_balance_collected / order_refund / order_cost
 * (all optional) from the finance API payload and renders them separately from
 * dress rent so orders are clearly visible in the totals.
 */
export function FinanceOrdersSummary({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  const advance = Number(data.order_advance || 0);
  const balance = Number(data.order_balance_collected || 0);
  const refund = Number(data.order_refund || 0);
  const cost = Number(data.order_cost || 0);
  const count = Number(data.orders_booked || 0);
  const hasLifecycle = data.orders_received != null || data.orders_delivered != null || data.orders_cancelled != null;
  const received = Number(data.orders_received || 0);
  const delivered = Number(data.orders_delivered || 0);
  const cancelled = Number(data.orders_cancelled || 0);

  if (advance <= 0 && balance <= 0 && refund <= 0 && cost <= 0 && received <= 0 && delivered <= 0 && cancelled <= 0) return null;

  const net = advance + balance - refund;

  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ margin: "0 0 12px", color: "#8a6d1a", display: "flex", alignItems: "center", gap: 8 }}>
        <i className="fa-solid fa-scissors" />
        Custom Orders
      </h4>
      <div className="stats-grid">
        {cost > 0 && (
          <div className="stat-card">
            <div className="stat-value">₹{formatInr(cost)}</div>
            <div className="stat-label">Orders Total (Cost)</div>
            {count > 0 && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                {count} order{count === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}
        <div className="stat-card success">
          <div className="stat-value">₹{formatInr(advance)}</div>
          <div className="stat-label">Order Advance</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">₹{formatInr(balance)}</div>
          <div className="stat-label">Order Balance Collected</div>
        </div>
        {refund > 0 && (
          <div className="stat-card warning">
            <div className="stat-value">₹{formatInr(refund)}</div>
            <div className="stat-label">Order Refund</div>
          </div>
        )}
        <div className="stat-card gold">
          <div className="stat-value">₹{formatInr(net)}</div>
          <div className="stat-label">Orders Net in Sale</div>
        </div>
      </div>
      {hasLifecycle && (
        <div className="stats-grid" style={{ marginTop: 12 }}>
          <div className="stat-card primary">
            <div className="stat-value">{received}</div>
            <div className="stat-label">New Orders Received</div>
          </div>
          <div className="stat-card success">
            <div className="stat-value">{delivered}</div>
            <div className="stat-label">Orders Delivered</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{cancelled}</div>
            <div className="stat-label">Orders Cancelled</div>
          </div>
        </div>
      )}
    </div>
  );
}
