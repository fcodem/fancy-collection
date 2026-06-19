"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { formatInr } from "@/lib/format";

declare global {
  interface Window {
    Chart: typeof import("chart.js").Chart;
  }
}

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
    advance_mens?: number;
    advance_womens?: number;
    advance_jewellery?: number;
    remaining_mens?: number;
    remaining_womens?: number;
    remaining_jewellery?: number;
    advance_by_category?: Record<string, number>;
    remaining_by_category?: Record<string, number>;
  } | null;

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" />
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
              <table className="data-table">
                <thead><tr><th>Category</th><th>Advance</th><th>Remaining</th><th>Total</th></tr></thead>
                <tbody>
                  {Object.keys({ ...(d.advance_by_category || {}), ...(d.remaining_by_category || {}) }).map((cat) => {
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
    </>
  );
}
