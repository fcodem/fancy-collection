"use client";

import { useEffect, useState } from "react";
import { FinanceChart, FinanceCompareChart } from "@/components/finance/FinanceChart";
import { formatInr } from "@/lib/format";

export function FinanceDailyBooking({ todayIso }: { todayIso: string }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<{
    grand_total?: number;
    mens_total?: number;
    womens_total?: number;
    jewellery_total?: number;
    total_by_category?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/finance/daily-booking?date=${date}`).then((r) => r.json()).then(setData);
  }, [date]);

  const labels = data?.total_by_category ? Object.keys(data.total_by_category) : [];
  const values = data?.total_by_category ? Object.values(data.total_by_category) : [];

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-receipt" style={{ marginRight: 8 }} />Daily Booking Amount</h3></div>
      <div className="card-body">
        <input type="date" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={date} onChange={(e) => setDate(e.target.value)} />
        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div className="stat-card primary" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.grand_total || 0)}</div>
                <div className="stat-label">Total Booking Amount</div>
              </div>
              <div className="stat-card success" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.mens_total || 0)}</div>
                <div className="stat-label">Men&apos;s Total</div>
              </div>
              <div className="stat-card" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.womens_total || 0)}</div>
                <div className="stat-label">Women&apos;s Total</div>
              </div>
              <div className="stat-card gold" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.jewellery_total || 0)}</div>
                <div className="stat-label">Jewellery Total</div>
              </div>
            </div>
            {labels.length > 0 && (
              <div className="two-col">
                <FinanceChart type="pie" labels={labels} values={values} title="Category Breakdown" />
                <table className="data-table">
                  <thead><tr><th>Category</th><th>Amount</th></tr></thead>
                  <tbody>
                    {labels.map((cat, i) => (
                      <tr key={cat}><td>{cat}</td><td><strong>₹{formatInr(values[i])}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function FinanceMonthlySale({ todayMonthIso }: { todayMonthIso: string }) {
  const [m, setM] = useState(todayMonthIso);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch(`/api/finance/monthly-sale?month=${m}`).then((r) => r.json()).then(setData);
  }, [m]);

  const catTotals = (data?.category_totals as Record<string, number>) || {};
  const catLabels = Object.keys(catTotals);
  const catValues = Object.values(catTotals);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Monthly Sale</h3></div>
      <div className="card-body">
        <input type="month" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={m} onChange={(e) => setM(e.target.value)} />
        {data && (
          <>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.total_sale))}</div><div className="stat-label">Total Sale</div></div>
              <div className="stat-card"><div className="stat-value">{String(data.booking_count)}</div><div className="stat-label">Bookings</div></div>
              <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.mens_total))}</div><div className="stat-label">Men&apos;s</div></div>
              <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.womens_total))}</div><div className="stat-label">Women&apos;s</div></div>
            </div>
            {catLabels.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <FinanceChart type="bar" labels={catLabels} values={catValues} title="Category Revenue" height={300} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function FinanceYearlySale() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { fetch("/api/finance/yearly-sale").then((r) => r.json()).then(setData); }, []);

  const monthly = (data?.monthly_breakdown as Record<string, number>) || {};
  const monthLabels = Object.keys(monthly);
  const monthValues = Object.values(monthly);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Yearly Sale (Apr–Mar)</h3></div>
      <div className="card-body">
        {data && (
          <>
            <p style={{ marginBottom: 16, color: "var(--text-muted)" }}>{String(data.from)} to {String(data.to)}</p>
            <div className="stats-grid">
              <div className="stat-card gold"><div className="stat-value">₹{formatInr(Number(data.total_sale))}</div><div className="stat-label">Total Sale</div></div>
              <div className="stat-card"><div className="stat-value">{String(data.booking_count)}</div><div className="stat-label">Bookings</div></div>
            </div>
            {monthLabels.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <FinanceChart type="bar" labels={monthLabels} values={monthValues} title="Monthly Revenue" height={320} />
              </div>
            )}
            {monthLabels.length > 0 && (
              <table className="data-table" style={{ marginTop: 24 }}>
                <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                <tbody>
                  {monthLabels.map((m) => (
                    <tr key={m}><td>{m}</td><td>₹{formatInr(monthly[m])}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function FinanceTopPerformer({
  monthStartIso,
  todayIso,
  categories = [],
}: {
  monthStartIso: string;
  todayIso: string;
  categories?: string[];
}) {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<Array<{ name: string; category: string; bookings: number; total_earned: number }>>([]);

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    if (category) params.set("category", category);
    fetch(`/api/finance/top-performer?${params}`).then((r) => r.json()).then(setRows);
  }, [from, to, category]);

  const top10 = rows.slice(0, 10);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Top Performer</h3></div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Category (optional)</label>
            <select className="form-control" style={{ minWidth: 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {top10.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <FinanceChart
              type="bar"
              labels={top10.map((r) => r.name)}
              values={top10.map((r) => r.total_earned)}
              title="Top 10 by Revenue"
              height={300}
              horizontal
            />
          </div>
        )}
        <table className="data-table">
          <thead><tr><th>#</th><th>Dress</th><th>Category</th><th>Bookings</th><th>Earned</th></tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td><strong>{r.name}</strong></td><td>{r.category}</td><td>{r.bookings}</td><td>₹{formatInr(r.total_earned)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FinanceSecurityDeposit() {
  const [data, setData] = useState<{ total_collected: number; total_held: number; total_returned: number; bookings: Array<Record<string, unknown>> } | null>(null);
  useEffect(() => { fetch("/api/finance/security-deposit").then((r) => r.json()).then(setData); }, []);

  const statusCounts: Record<string, number> = {};
  if (data?.bookings) {
    for (const b of data.bookings) {
      const s = String(b.status);
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
  }

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Security Deposit</h3></div>
      <div className="card-body">
        {data && (
          <>
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card success"><div className="stat-value">₹{formatInr(data.total_collected)}</div><div className="stat-label">Collected</div></div>
              <div className="stat-card warning"><div className="stat-value">₹{formatInr(data.total_held)}</div><div className="stat-label">Held</div></div>
              <div className="stat-card info"><div className="stat-value">₹{formatInr(data.total_returned)}</div><div className="stat-label">Returned</div></div>
            </div>
            {Object.keys(statusCounts).length > 0 && (
              <div style={{ marginBottom: 24, maxWidth: 360 }}>
                <FinanceChart type="doughnut" labels={Object.keys(statusCounts)} values={Object.values(statusCounts)} title="By Status" height={240} />
              </div>
            )}
            <table className="data-table">
              <thead><tr><th>Serial</th><th>Customer</th><th>Collected</th><th>Held</th><th>Status</th></tr></thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={String(b.id)}><td>{String(b.serial).padStart(2, "0")}</td><td>{String(b.customer_name)}</td><td>₹{formatInr(Number(b.security_collected))}</td><td>₹{formatInr(Number(b.security_held || 0))}</td><td>{String(b.status)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export function FinanceCategoryAnalysis({ monthStartIso, todayIso }: { monthStartIso: string; todayIso: string }) {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [data, setData] = useState<{ categories: Array<Record<string, unknown>> } | null>(null);
  useEffect(() => {
    fetch(`/api/finance/category-analysis?from=${from}&to=${to}`).then((r) => r.json()).then(setData);
  }, [from, to]);

  const cats = data?.categories || [];
  const labels = cats.map((c) => String(c.category));
  const revenue = cats.map((c) => Number(c.total_sale));
  const purchases = cats.map((c) => Number(c.net_purchase));

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Category Analysis — Revenue vs Stock</h3></div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {cats.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <FinanceCompareChart labels={labels} revenue={revenue} purchases={purchases} />
          </div>
        )}
        {data && (
          <table className="data-table">
            <thead><tr><th>Category</th><th>Stock Purchased</th><th>Advance</th><th>Remaining</th><th>Revenue</th><th>Stock Count</th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={String(c.category)}>
                  <td>{String(c.category)}</td>
                  <td>₹{formatInr(Number(c.net_purchase))}</td>
                  <td>₹{formatInr(Number(c.advance))}</td>
                  <td>₹{formatInr(Number(c.remaining_collected))}</td>
                  <td><strong>₹{formatInr(Number(c.total_sale))}</strong></td>
                  <td>{String(c.stock_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
