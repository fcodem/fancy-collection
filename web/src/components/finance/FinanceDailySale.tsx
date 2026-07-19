"use client";

import { useEffect, useState } from "react";
import { FinanceCategorySaleTable } from "@/components/finance/FinanceCategorySaleTable";
import { FinanceChart } from "@/components/finance/FinanceChart";
import { FinanceChartSection } from "@/components/finance/FinanceChartSection";
import { fetchFinanceJson } from "@/components/finance/financeFetch";
import { FinanceInactiveStats } from "@/components/finance/FinanceInactiveStats";
import { FinanceOrdersSummary } from "@/components/finance/FinanceOrdersSummary";
import { CUSTOM_ORDERS_CATEGORY } from "@/lib/financeBookingAmounts";
import { categoryLabelKeys, numberMap, numberValue } from "@/lib/finance/safeNumbers";
import { formatInr } from "@/lib/format";

export default function FinanceDailySalePage({ todayIso }: { todayIso: string }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<Record<string, unknown>>(`/api/finance/daily-sale?date=${date}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [date]);

  const d = data as {
    total_advance?: number;
    total_remaining_collected?: number;
    total_balance_at_delivery?: number;
    total_balance_at_return?: number;
    advance_count?: number;
    balance_count?: number;
    balance_delivery_count?: number;
    balance_return_count?: number;
    advance_cash?: number;
    advance_online?: number;
    remaining_cash?: number;
    remaining_online?: number;
    payment_collected_cash?: number;
    payment_collected_online?: number;
    total_sale?: number;
    advance_by_category?: Record<string, number>;
    balance_by_category?: Record<string, number>;
    category_booking_counts?: Record<string, number>;
    category_delivered_counts?: Record<string, number>;
    dresses_by_category?: Record<string, number>;
    dresses_booked?: number;
    orders_booked?: number;
    booking_count?: number;
    cancelled_count?: number;
    cancelled_amount?: number;
    postponed_count?: number;
    postponed_amount?: number;
    order_advance?: number;
    order_balance_collected?: number;
    order_refund?: number;
  } | null;

  const advanceByCategory = numberMap(d?.advance_by_category);
  const balanceByCategory = numberMap(d?.balance_by_category);
  const catLabels = categoryLabelKeys(advanceByCategory, balanceByCategory);
  const catValues = catLabels.map(
    (cat) => numberValue(advanceByCategory[cat]) + numberValue(balanceByCategory[cat]),
  );
  const dressCounts = numberMap(d?.dresses_by_category);
  if (numberValue(d?.orders_booked) > 0) {
    dressCounts[CUSTOM_ORDERS_CATEGORY] = numberValue(d?.orders_booked);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title"><i className="fa-solid fa-coins" style={{ marginRight: 8 }} />Daily Sale</h3>
      </div>
      <div className="card-body">
        <input type="date" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={date} onChange={(e) => setDate(e.target.value)} />
        {mounted && loading && <p style={{ color: "var(--text-muted)" }}>Loading report…</p>}
        {mounted && error && <p className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</p>}
        {d && !loading && (
          <>
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card success">
                <div className="stat-value">₹{formatInr(d.total_advance || 0)}</div>
                <div className="stat-label">Total Advance</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{d.advance_count ?? 0} received</div>
              </div>
              <div className="stat-card info">
                <div className="stat-value">₹{formatInr(d.total_balance_at_delivery ?? 0)}</div>
                <div className="stat-label">Balance at Delivery</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  {d.balance_delivery_count ?? 0} received
                </div>
              </div>
              {((d.total_balance_at_return ?? 0) > 0 || (d.balance_return_count ?? 0) > 0) && (
                <div className="stat-card warning">
                  <div className="stat-value">₹{formatInr(d.total_balance_at_return || 0)}</div>
                  <div className="stat-label">Balance at Return</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                    {d.balance_return_count ?? 0} transaction{(d.balance_return_count ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
              )}
              <div className="stat-card gold">
                <div className="stat-value">₹{formatInr(d.total_sale || 0)}</div>
                <div className="stat-label">Total Sale</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  Advance + Balance (delivery &amp; return) + Custom Orders
                </div>
              </div>
              <div className="stat-card primary"><div className="stat-value">₹{formatInr(d.payment_collected_cash || 0)}</div><div className="stat-label">Cash Collected</div></div>
              <div className="stat-card"><div className="stat-value">₹{formatInr(d.payment_collected_online || 0)}</div><div className="stat-label">Online Collected</div></div>
            </div>
            {(d.advance_cash != null || d.advance_online != null) && (
              <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
                Advance: Cash ₹{formatInr(d.advance_cash || 0)} · Online ₹{formatInr(d.advance_online || 0)}
                {" · "}
                Balance: Cash ₹{formatInr(d.remaining_cash || 0)} · Online ₹{formatInr(d.remaining_online || 0)}
              </p>
            )}
            <FinanceOrdersSummary data={d as unknown as Record<string, unknown>} />
            <FinanceInactiveStats data={d} />
            {catLabels.length > 0 ? (
              <>
                <div style={{ marginBottom: 24 }}>
                  <FinanceChartSection title="Sale by Category">
                    <FinanceChart type="pie" labels={catLabels} values={catValues} title="Sale by Category" height={280} />
                  </FinanceChartSection>
                </div>
                <FinanceCategorySaleTable
                  advanceByCategory={advanceByCategory}
                  balanceByCategory={balanceByCategory}
                  bookingCounts={d.category_booking_counts}
                  dressCounts={dressCounts}
                  deliveredCounts={d.category_delivered_counts}
                />
              </>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No sales recorded on this date.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
