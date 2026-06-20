"use client";

import { useEffect, useState } from "react";
import { FinanceChart } from "@/components/finance/FinanceChart";
import { formatInr } from "@/lib/format";

export default function FinanceDailySalePage({ todayIso }: { todayIso: string }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch(`/api/finance/daily-sale?date=${date}`)
      .then((r) => r.json())
      .then(setData);
  }, [date]);

  const d = data as {
    total_advance?: number;
    total_remaining_collected?: number;
    total_sale?: number;
    advance_by_category?: Record<string, number>;
    remaining_by_category?: Record<string, number>;
  } | null;

  const allCats = new Set([
    ...Object.keys(d?.advance_by_category || {}),
    ...Object.keys(d?.remaining_by_category || {}),
  ]);
  const catLabels = Array.from(allCats);
  const catValues = catLabels.map((cat) => (d?.advance_by_category?.[cat] || 0) + (d?.remaining_by_category?.[cat] || 0));

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title"><i className="fa-solid fa-coins" style={{ marginRight: 8 }} />Daily Sale</h3>
      </div>
      <div className="card-body">
        <input type="date" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={date} onChange={(e) => setDate(e.target.value)} />
        {d && (
          <>
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card success"><div className="stat-value">₹{formatInr(d.total_advance || 0)}</div><div className="stat-label">Total Advance</div></div>
              <div className="stat-card info"><div className="stat-value">₹{formatInr(d.total_remaining_collected || 0)}</div><div className="stat-label">Remaining Collected</div></div>
              <div className="stat-card gold"><div className="stat-value">₹{formatInr(d.total_sale || 0)}</div><div className="stat-label">Total Sale</div></div>
            </div>
            {catLabels.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <FinanceChart type="pie" labels={catLabels} values={catValues} title="Sale by Category" height={280} />
              </div>
            )}
            <table className="data-table">
              <thead><tr><th>Category</th><th>Advance</th><th>Remaining</th><th>Total</th></tr></thead>
              <tbody>
                {catLabels.map((cat) => {
                  const a = d.advance_by_category?.[cat] || 0;
                  const r = d.remaining_by_category?.[cat] || 0;
                  return <tr key={cat}><td>{cat}</td><td>₹{formatInr(a)}</td><td>₹{formatInr(r)}</td><td><strong>₹{formatInr(a + r)}</strong></td></tr>;
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
