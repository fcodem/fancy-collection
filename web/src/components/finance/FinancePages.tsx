"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
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
    <>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" />
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
                  <div>
                    <h4 style={{ fontSize: 14, marginBottom: 12 }}>Category Breakdown</h4>
                    <canvas id="dailyBookingChart" height={250} />
                  </div>
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
      {labels.length > 0 && (
        <ChartInit labels={labels} values={values} canvasId="dailyBookingChart" />
      )}
    </>
  );
}

function ChartInit({ labels, values, canvasId }: { labels: string[]; values: number[]; canvasId: string }) {
  useEffect(() => {
    const Chart = (window as unknown as { Chart?: { new(ctx: string | HTMLCanvasElement, cfg: object): { destroy(): void } } }).Chart;
    if (!Chart) return;
    const el = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!el) return;
    const colors = ["#7B1F45", "#C9A846", "#2E7D32", "#1565C0", "#E65100", "#6A1B9A", "#00838F"];
    const chart = new Chart(el, {
      type: "pie",
      data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
      options: { plugins: { legend: { position: "bottom" } } },
    });
    return () => chart.destroy();
  }, [labels, values, canvasId]);
  return null;
}

export function FinanceMonthlySale({ todayMonthIso }: { todayMonthIso: string }) {
  const [m, setM] = useState(todayMonthIso);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch(`/api/finance/monthly-sale?month=${m}`).then((r) => r.json()).then(setData);
  }, [m]);
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Monthly Sale</h3></div>
      <div className="card-body">
        <input type="month" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={m} onChange={(e) => setM(e.target.value)} />
        {data && (
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.total_sale))}</div><div className="stat-label">Total Sale</div></div>
            <div className="stat-card"><div className="stat-value">{String(data.booking_count)}</div><div className="stat-label">Bookings</div></div>
            <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.mens_total))}</div><div className="stat-label">Men&apos;s</div></div>
            <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.womens_total))}</div><div className="stat-label">Women&apos;s</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FinanceYearlySale() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { fetch("/api/finance/yearly-sale").then((r) => r.json()).then(setData); }, []);
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
            {data.monthly_breakdown && (
              <table className="data-table" style={{ marginTop: 24 }}>
                <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                <tbody>
                  {Object.entries(data.monthly_breakdown as Record<string, number>).map(([m, v]) => (
                    <tr key={m}><td>{m}</td><td>₹{formatInr(v)}</td></tr>
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

export function FinanceTopPerformer({ monthStartIso, todayIso }: { monthStartIso: string; todayIso: string }) {
  const [rows, setRows] = useState<Array<{ name: string; category: string; bookings: number; total_earned: number }>>([]);
  useEffect(() => {
    fetch(`/api/finance/top-performer?from=${monthStartIso}&to=${todayIso}`).then((r) => r.json()).then(setRows);
  }, [monthStartIso, todayIso]);
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Top Performer</h3></div>
      <div className="card-body p-0">
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
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Category Analysis</h3></div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {data && (
          <table className="data-table">
            <thead><tr><th>Category</th><th>Purchases</th><th>Advance</th><th>Remaining</th><th>Sale</th><th>Stock</th></tr></thead>
            <tbody>
              {data.categories.map((c) => (
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
