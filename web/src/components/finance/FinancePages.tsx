"use client";

import { useEffect, useState } from "react";
import { FinanceChart, FinanceCompareChart } from "@/components/finance/FinanceChart";
import { fetchFinanceJson } from "@/components/finance/financeFetch";
import { FinanceInactiveStats } from "@/components/finance/FinanceInactiveStats";
import { formatInr } from "@/lib/format";

function FinanceStatus({ loading, error }: { loading: boolean; error: string }) {
  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading report…</p>;
  if (error) return <p className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</p>;
  return null;
}

export function FinanceDailyBooking({ todayIso }: { todayIso: string }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<{
    grand_total?: number;
    mens_total?: number;
    womens_total?: number;
    jewellery_total?: number;
    total_by_category?: Record<string, number>;
    cancelled_count?: number;
    cancelled_amount?: number;
    postponed_count?: number;
    postponed_amount?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<typeof data>(`/api/finance/daily-booking?date=${date}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [date]);

  const labels = data?.total_by_category ? Object.keys(data.total_by_category) : [];
  const values = data?.total_by_category ? Object.values(data.total_by_category) : [];

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-receipt" style={{ marginRight: 8 }} />Daily Booking Amount</h3></div>
      <div className="card-body">
        <input type="date" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
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
            <FinanceInactiveStats data={data} />
            {labels.length > 0 ? (
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
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No bookings on this date.</p>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<Record<string, unknown>>(`/api/finance/monthly-sale?month=${m}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [m]);

  const catTotals = (data?.category_totals as Record<string, number>) || {};
  const catLabels = Object.keys(catTotals);
  const catValues = Object.values(catTotals);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-calendar-days" style={{ marginRight: 8 }} />Monthly Sale</h3></div>
      <div className="card-body">
        <input type="month" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={m} onChange={(e) => setM(e.target.value)} />
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
          <>
            <div className="stats-grid">
              <div className="stat-card gold"><div className="stat-value">₹{formatInr(Number(data.total_sale))}</div><div className="stat-label">Total Sale</div></div>
              <div className="stat-card primary"><div className="stat-value">₹{formatInr(Number(data.total_advance))}</div><div className="stat-label">Advance</div></div>
              <div className="stat-card info"><div className="stat-value">₹{formatInr(Number(data.total_remaining))}</div><div className="stat-label">Remaining</div></div>
              <div className="stat-card"><div className="stat-value">{String(data.booking_count)}</div><div className="stat-label">Bookings</div></div>
              <div className="stat-card success"><div className="stat-value">₹{formatInr(Number(data.mens_total))}</div><div className="stat-label">Men&apos;s</div></div>
              <div className="stat-card"><div className="stat-value">₹{formatInr(Number(data.womens_total))}</div><div className="stat-label">Women&apos;s</div></div>
              <div className="stat-card gold"><div className="stat-value">₹{formatInr(Number(data.jewellery_total))}</div><div className="stat-label">Jewellery</div></div>
            </div>
            <FinanceInactiveStats
              data={{
                cancelled_count: Number(data.cancelled_count),
                cancelled_amount: Number(data.cancelled_amount),
                postponed_count: Number(data.postponed_count),
                postponed_amount: Number(data.postponed_amount),
              }}
            />
            {catLabels.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <FinanceChart type="bar" labels={catLabels} values={catValues} title="Category Revenue" height={300} />
                <table className="data-table" style={{ marginTop: 20 }}>
                  <thead><tr><th>Category</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {catLabels.map((cat) => (
                      <tr key={cat}><td>{cat}</td><td>₹{formatInr(catTotals[cat])}</td></tr>
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

export function FinanceYearlySale() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<Record<string, unknown>>("/api/finance/yearly-sale")
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

  const monthly = (data?.monthly_breakdown as Record<string, number>) || {};
  const monthLabels = Object.keys(monthly);
  const monthValues = Object.values(monthly);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Yearly Sale (Apr–Mar)</h3></div>
      <div className="card-body">
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
          <>
            <p style={{ marginBottom: 16, color: "var(--text-muted)" }}>{String(data.from)} to {String(data.to)}</p>
            <div className="stats-grid">
              <div className="stat-card gold"><div className="stat-value">₹{formatInr(Number(data.total_sale))}</div><div className="stat-label">Total Sale</div></div>
              <div className="stat-card"><div className="stat-value">{String(data.booking_count)}</div><div className="stat-label">Bookings</div></div>
            </div>
            <FinanceInactiveStats
              data={{
                cancelled_count: Number(data.cancelled_count),
                cancelled_amount: Number(data.cancelled_amount),
                postponed_count: Number(data.postponed_count),
                postponed_amount: Number(data.postponed_amount),
              }}
            />
            {monthLabels.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <FinanceChart type="bar" labels={monthLabels} values={monthValues} title="Monthly Revenue" height={320} />
              </div>
            )}
            {monthLabels.length > 0 && (
              <table className="data-table" style={{ marginTop: 24 }}>
                <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                <tbody>
                  {monthLabels.map((mo) => (
                    <tr key={mo}><td>{mo}</td><td>₹{formatInr(monthly[mo])}</td></tr>
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
  const [dressSearch, setDressSearch] = useState("");
  const [rows, setRows] = useState<Array<{ name: string; category: string; bookings: number; total_earned: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ from, to });
    if (category) params.set("category", category);
    if (dressSearch.trim()) params.set("dress", dressSearch.trim());
    fetchFinanceJson<Array<{ name: string; category: string; bookings: number; total_earned: number }>>(
      `/api/finance/top-performer?${params}`,
    )
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [from, to, category, dressSearch]);

  const top10 = rows.slice(0, 10);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-trophy" style={{ marginRight: 8 }} />Top Performer</h3></div>
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
          <div>
            <label className="form-label">Dress name search</label>
            <input
              type="search"
              className="form-control"
              style={{ minWidth: 200 }}
              placeholder="Search dress name…"
              value={dressSearch}
              onChange={(e) => setDressSearch(e.target.value)}
            />
          </div>
        </div>
        <FinanceStatus loading={loading} error={error} />
        {!loading && !error && top10.length > 0 && (
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
        {!loading && !error && rows.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No performers found for this range.</p>
        )}
        {!loading && rows.length > 0 && (
          <table className="data-table">
            <thead><tr><th>#</th><th>Dress</th><th>Category</th><th>Bookings</th><th>Earned</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={`${r.name}-${i}`}><td>{i + 1}</td><td><strong>{r.name}</strong></td><td>{r.category}</td><td>{r.bookings}</td><td>₹{formatInr(r.total_earned)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function FinanceSecurityDeposit() {
  const [data, setData] = useState<{ total_collected: number; total_held: number; total_returned: number; bookings: Array<Record<string, unknown>> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<typeof data>("/api/finance/security-deposit")
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

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
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<{ categories: Array<Record<string, unknown>> }>(
      `/api/finance/category-analysis?from=${from}&to=${to}`,
    )
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const cats = data?.categories || [];
  const labels = cats.map((c) => String(c.category));
  const revenue = cats.map((c) => Number(c.total_sale));
  const purchases = cats.map((c) => Number(c.net_purchase));
  const pieCats = cats.filter((c) => Number(c.total_sale) > 0);
  const pieLabels = pieCats.map((c) => String(c.category));
  const pieRevenue = pieCats.map((c) => Number(c.total_sale));

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-chart-pie" style={{ marginRight: 8 }} />Category Analysis — Revenue vs Stock</h3></div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <FinanceStatus loading={loading} error={error} />
        {!loading && !error && cats.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div className="two-col">
              <FinanceChart
                type="pie"
                labels={pieLabels}
                values={pieRevenue}
                title="Revenue by Category"
                height={300}
              />
              <FinanceCompareChart labels={labels} revenue={revenue} purchases={purchases} />
            </div>
          </div>
        )}
        {!loading && !error && cats.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No category data for this date range.</p>
        )}
        {data && !loading && cats.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Category</th><th>Bookings</th><th>Stock Purchased</th><th>Advance</th><th>Remaining</th><th>Revenue</th><th>Stock Count</th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={String(c.category)}>
                  <td><strong>{String(c.category)}</strong></td>
                  <td>{String(c.booking_count ?? 0)}</td>
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

export function FinanceInventoryProfitability() {
  const [data, setData] = useState<{
    category_breakdown?: Array<{
      category: string;
      total_sale: number;
      total_purchase: number;
      item_count: number;
    }>;
    totals: {
      itemCount: number;
      itemsWithRevenue: number;
      totalRevenue: number;
      totalBookings: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<NonNullable<typeof data>>("/api/finance/inventory-profitability")
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

  const categoryRows = data?.category_breakdown || [];
  const catLabels = categoryRows.map((r) => r.category);
  const catSales = categoryRows.map((r) => r.total_sale);
  const catPurchases = categoryRows.map((r) => r.total_purchase);
  const totalPurchase = categoryRows.reduce((s, r) => s + r.total_purchase, 0);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <i className="fa-solid fa-chart-column" style={{ marginRight: 8 }} />
          Inventory Profitability
        </h3>
      </div>
      <div className="card-body">
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
          Category-wise lifetime rental revenue vs stock purchased (all inventory).
        </p>

        <FinanceStatus loading={loading} error={error} />

        {data && !loading && (
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card primary" style={{ padding: 20 }}>
              <div className="stat-value">₹{formatInr(data.totals.totalRevenue)}</div>
              <div className="stat-label">Total Lifetime Sale</div>
            </div>
            <div className="stat-card gold" style={{ padding: 20 }}>
              <div className="stat-value">₹{formatInr(totalPurchase)}</div>
              <div className="stat-label">Total Purchase</div>
            </div>
            <div className="stat-card success" style={{ padding: 20 }}>
              <div className="stat-value">₹{formatInr(data.totals.totalRevenue - totalPurchase)}</div>
              <div className="stat-label">Net (Sale − Purchase)</div>
            </div>
            <div className="stat-card info" style={{ padding: 20 }}>
              <div className="stat-value">{data.totals.totalBookings}</div>
              <div className="stat-label">Completed Rentals</div>
            </div>
          </div>
        )}

        {!loading && !error && categoryRows.length > 0 && (
          <>
            <div className="two-col" style={{ marginBottom: 24 }}>
              <FinanceChart
                type="pie"
                labels={catLabels}
                values={catSales}
                title="Sale by Category"
                height={300}
              />
              <FinanceCompareChart
                labels={catLabels}
                revenue={catSales}
                purchases={catPurchases}
                title="Category Sale vs Purchase"
              />
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Items in Stock</th>
                  <th>Total Sale</th>
                  <th>Total Purchase</th>
                  <th>Net (Sale − Purchase)</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row) => (
                  <tr key={row.category}>
                    <td><strong>{row.category}</strong></td>
                    <td>{row.item_count}</td>
                    <td>₹{formatInr(row.total_sale)}</td>
                    <td>₹{formatInr(row.total_purchase)}</td>
                    <td>
                      <strong>₹{formatInr(row.total_sale - row.total_purchase)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!loading && !error && categoryRows.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No category data available.</p>
        )}
      </div>
    </div>
  );
}
