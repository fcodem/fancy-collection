"use client";

import { useEffect, useState } from "react";
import { FinanceChart, FinanceCompareChart } from "@/components/finance/FinanceChart";
import { FinanceChartSection } from "@/components/finance/FinanceChartSection";
import { fetchFinanceJson } from "@/components/finance/financeFetch";
import { FinanceCategorySaleTable } from "@/components/finance/FinanceCategorySaleTable";
import { FinanceInactiveStats } from "@/components/finance/FinanceInactiveStats";
import { FinanceOrdersSummary } from "@/components/finance/FinanceOrdersSummary";
import { CUSTOM_ORDERS_CATEGORY } from "@/lib/financeBookingAmounts";
import {
  categoryLabelKeys,
  mergeNumberMaps,
  numberMap,
  numberMapKeys,
  numberMapValues,
  numberValue,
} from "@/lib/finance/safeNumbers";
import { formatInr } from "@/lib/format";

function FinanceStatus({ loading, error }: { loading: boolean; error: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading report…</p>;
  if (error) return <p className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</p>;
  return null;
}

function financeSaleSubtitle(data: Record<string, unknown>): string | null {
  const advanceRefunded = numberValue(data.advance_refunded ?? data.refund_total);
  const postponedAdvance = numberValue(data.postponed_advance);
  if (advanceRefunded <= 0 && postponedAdvance <= 0) return null;
  return [
    advanceRefunded > 0 ? `−₹${formatInr(advanceRefunded)} refunded` : null,
    postponedAdvance > 0 ? `−₹${formatInr(postponedAdvance)} postponed` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Shared stat cards + inactive bookings + custom orders — identical on Monthly & Yearly Sale. */
function FinanceSaleStatsSection({ data }: { data: Record<string, unknown> }) {
  const saleSubtitle = financeSaleSubtitle(data);

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card gold">
          <div className="stat-value">₹{formatInr(numberValue(data.total_sale))}</div>
          <div className="stat-label">Total Sale</div>
          {saleSubtitle && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{saleSubtitle}</div>
          )}
        </div>
        <div className="stat-card primary">
          <div className="stat-value">₹{formatInr(Number(data.total_advance))}</div>
          <div className="stat-label">Total Advance Received</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            {Number(data.advance_count ?? 0)} advance{Number(data.advance_count ?? 0) === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">₹{formatInr(Number(data.total_balance_at_delivery ?? data.total_balance_received ?? data.total_remaining))}</div>
          <div className="stat-label">Balance at Delivery</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            {Number(data.balance_delivery_count ?? 0)} received
          </div>
        </div>
        {(Number(data.total_balance_at_return ?? 0) > 0 || Number(data.balance_return_count ?? 0) > 0) && (
          <div className="stat-card warning">
            <div className="stat-value">₹{formatInr(Number(data.total_balance_at_return))}</div>
            <div className="stat-label">Balance at Return</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {Number(data.balance_return_count ?? 0)} transaction{Number(data.balance_return_count ?? 0) === 1 ? "" : "s"}
            </div>
          </div>
        )}
        <div className="stat-card info">
          <div className="stat-value">{Number(data.booking_count ?? 0)}</div>
          <div className="stat-label">New Bookings</div>
          {(Number(data.dresses_booked ?? 0) > 0 || Number(data.orders_booked ?? 0) > 0) && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {Number(data.dresses_booked ?? 0)} dress{(Number(data.dresses_booked ?? 0) === 1 ? "" : "es")}
              {Number(data.orders_booked ?? 0) > 0
                ? ` · ${Number(data.orders_booked)} order${Number(data.orders_booked) === 1 ? "" : "s"}`
                : ""}
            </div>
          )}
        </div>
        <div className="stat-card success">
          <div className="stat-value">{Number(data.dresses_delivered ?? 0)}</div>
          <div className="stat-label">Dresses Delivered</div>
        </div>
        {(Number(data.dresses_delivered ?? 0) > 0 || Number(data.orders_delivered ?? 0) > 0) && (
          <div className="stat-card success">
            <div className="stat-value">
              {Number(data.dresses_delivered ?? 0) + Number(data.orders_delivered ?? 0)}
            </div>
            <div className="stat-label">Successful Deliveries</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {Number(data.dresses_delivered ?? 0)} dresses · {Number(data.orders_delivered ?? 0)} orders
            </div>
          </div>
        )}
        <div className="stat-card success">
          <div className="stat-value">₹{formatInr(Number(data.payment_collected_cash || 0))}</div>
          <div className="stat-label">Cash Collected</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{formatInr(Number(data.payment_collected_online || 0))}</div>
          <div className="stat-label">Online Collected</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">₹{formatInr(Number(data.mens_total))}</div>
          <div className="stat-label">Men&apos;s</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Sale collected</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{formatInr(Number(data.womens_total))}</div>
          <div className="stat-label">Women&apos;s</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Sale collected</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-value">₹{formatInr(Number(data.jewellery_total))}</div>
          <div className="stat-label">Jewellery</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Sale collected</div>
        </div>
      </div>
      <FinanceInactiveStats
        data={{
          cancelled_count: Number(data.cancelled_count),
          cancelled_amount: Number(data.cancelled_amount),
          cancelled_advance_refunded: Number(data.cancelled_advance_refunded),
          cancelled_advance_not_returned: Number(data.cancelled_advance_not_returned),
          postponed_count: Number(data.postponed_count),
          postponed_amount: Number(data.postponed_amount),
        }}
      />
      <FinanceOrdersSummary data={data} />
    </>
  );
}

/** Shared category chart + category sale table — identical on Monthly & Yearly Sale. */
function FinanceSaleCategorySection({ data }: { data: Record<string, unknown> }) {
  const advanceByCategory = numberMap(data.advance_by_category);
  const balanceByCategory = numberMap(data.balance_by_category);
  const saleByCategory =
    numberMapKeys(data.sale_by_category).length > 0
      ? numberMap(data.sale_by_category)
      : mergeNumberMaps(advanceByCategory, balanceByCategory);
  const catBookingCounts = numberMap(data.category_booking_counts);
  const deliveredByCategory = numberMap(data.category_delivered_counts);
  const catLabels = numberMapKeys(saleByCategory);
  const catValues = numberMapValues(saleByCategory);

  if (catLabels.length === 0) {
    return <p style={{ color: "var(--text-muted)", marginTop: 24 }}>No category revenue in this period.</p>;
  }

  return (
    <>
      <div style={{ marginTop: 24 }}>
        <FinanceChartSection title="Sale by Category">
          <FinanceChart type="bar" labels={catLabels} values={catValues} title="Sale by Category" height={300} />
        </FinanceChartSection>
      </div>
      <FinanceCategorySaleTable
        advanceByCategory={advanceByCategory}
        balanceByCategory={balanceByCategory}
        bookingCounts={catBookingCounts}
        dressCounts={buildDressCountsByCategory(data)}
        deliveredCounts={deliveredByCategory}
      />
    </>
  );
}

/** Dress counts per category, including custom orders in the Custom Orders row. */
function buildDressCountsByCategory(data: Record<string, unknown>): Record<string, number> {
  const counts = numberMap(data.dresses_by_category);
  const orders = numberValue(data.orders_booked);
  if (orders > 0) {
    counts[CUSTOM_ORDERS_CATEGORY] = orders;
  }
  return counts;
}

export function FinanceDailyBooking({ todayIso }: { todayIso: string }) {
  const [date, setDate] = useState(todayIso);
  const [data, setData] = useState<{
    grand_total?: number;
    booking_amount?: number;
    order_cost?: number;
    orders_booked?: number;
    mens_total?: number;
    womens_total?: number;
    jewellery_total?: number;
    dresses_booked?: number;
    dresses_delivered_balance?: number;
    dresses_by_category?: Record<string, number>;
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

  const categoryTotals = numberMap(data?.total_by_category);
  const labels = numberMapKeys(categoryTotals);
  const values = numberMapValues(categoryTotals);
  const dressCounts = numberMap(data?.dresses_by_category);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-receipt" style={{ marginRight: 8 }} />Daily Booking Amount</h3></div>
      <div className="card-body">
        <input type="date" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div className="stat-card gold" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.grand_total ?? (data.booking_amount || 0) + (data.order_cost || 0))}</div>
                <div className="stat-label">Grand Total (Bookings + Orders)</div>
              </div>
              <div className="stat-card primary" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.booking_amount ?? data.grand_total ?? 0)}</div>
                <div className="stat-label">Total Booking Amount</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{data.dresses_booked ?? 0} dress{(data.dresses_booked ?? 0) === 1 ? "" : "es"} booked</div>
              </div>
              <div className="stat-card gold" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.order_cost || 0)}</div>
                <div className="stat-label">Total Custom Orders Amount</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{data.orders_booked ?? 0} order{(data.orders_booked ?? 0) === 1 ? "" : "s"} booked</div>
              </div>
              <div className="stat-card success" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.mens_total || 0)}</div>
                <div className="stat-label">Men&apos;s Total</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Dress booking value</div>
              </div>
              <div className="stat-card" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.womens_total || 0)}</div>
                <div className="stat-label">Women&apos;s Total</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Dress booking value</div>
              </div>
              <div className="stat-card gold" style={{ padding: 20 }}>
                <div className="stat-value">₹{formatInr(data.jewellery_total || 0)}</div>
                <div className="stat-label">Jewellery Total</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Dress booking value</div>
              </div>
            </div>
            <FinanceInactiveStats data={data} />
            {labels.length > 0 ? (
              <div className="two-col">
                <FinanceChartSection title="Category Breakdown">
                  <FinanceChart type="pie" labels={labels} values={values} title="Category Breakdown" />
                </FinanceChartSection>
                <table className="data-table">
                  <thead><tr><th>Category</th><th>Dresses Booked</th><th>Amount</th></tr></thead>
                  <tbody>
                    {labels.map((cat, i) => (
                      <tr key={cat}>
                        <td>{cat}</td>
                        <td><strong>{dressCounts[cat] ?? 0}</strong></td>
                        <td><strong>₹{formatInr(values[i])}</strong></td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                      <td>Total Bookings</td>
                      <td>{data.dresses_booked ?? labels.reduce((s, c) => s + (dressCounts[c] ?? 0), 0)}</td>
                      <td>₹{formatInr(data.booking_amount ?? values.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                    {(data.order_cost ?? 0) > 0 && (
                      <tr style={{ fontWeight: 600 }}>
                        <td>Custom Orders</td>
                        <td>{data.orders_booked ?? 0}</td>
                        <td>₹{formatInr(data.order_cost || 0)}</td>
                      </tr>
                    )}
                    <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                      <td>Grand Total</td>
                      <td>—</td>
                      <td>₹{formatInr(data.grand_total ?? (data.booking_amount || 0) + (data.order_cost || 0))}</td>
                    </tr>
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

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-calendar-days" style={{ marginRight: 8 }} />Monthly Sale</h3></div>
      <div className="card-body">
        <input type="month" className="form-control" style={{ maxWidth: 200, marginBottom: 20 }} value={m} onChange={(e) => setM(e.target.value)} />
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
          <>
            <FinanceSaleStatsSection data={data} />
            <FinanceSaleCategorySection data={data} />
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

  const monthly = numberMap(data?.monthly_breakdown);
  const monthLabels = numberMapKeys(monthly);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <i className="fa-solid fa-chart-line" style={{ marginRight: 8 }} />
          Yearly Sale (Apr–Mar)
        </h3>
      </div>
      <div className="card-body">
        {data && !loading && (
          <p style={{ marginBottom: 20, color: "var(--text-muted)" }}>{String(data.from)} to {String(data.to)}</p>
        )}
        <FinanceStatus loading={loading} error={error} />
        {data && !loading && (
          <>
            <FinanceSaleStatsSection data={data} />
            <FinanceSaleCategorySection data={data} />
            {monthLabels.length > 0 && (
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                <h4 style={{ margin: "0 0 16px", fontSize: 15, color: "var(--text-muted)" }}>Month-wise Revenue</h4>
                <FinanceChartSection title="Monthly Revenue">
                  <FinanceChart type="bar" labels={monthLabels} values={numberMapValues(monthly)} title="Monthly Revenue" height={300} />
                </FinanceChartSection>
                <table className="data-table" style={{ marginTop: 24 }}>
                  <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {monthLabels.map((mo) => (
                      <tr key={mo}><td>{mo}</td><td>₹{formatInr(monthly[mo])}</td></tr>
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
            <FinanceChartSection title="Top 10 by Revenue">
              <FinanceChart
                type="bar"
                labels={top10.map((r) => r.name)}
                values={top10.map((r) => numberValue(r.total_earned))}
                title="Top 10 by Revenue"
                height={300}
                horizontal
              />
            </FinanceChartSection>
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

export function FinanceSecurityDeposit({
  monthStartIso,
  todayIso,
}: {
  monthStartIso: string;
  todayIso: string;
}) {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [sortKey, setSortKey] = useState<
    "serial" | "customer" | "delivery_date" | "return_date" | "collected" | "held" | "status"
  >("delivery_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<{
    from?: string;
    to?: string;
    total_collected: number;
    total_held: number;
    total_returned: number;
    bookings: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchFinanceJson<typeof data>(`/api/finance/security-deposit?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const rows = [...(data?.bookings || [])].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "serial":
        cmp = Number(a.serial) - Number(b.serial);
        break;
      case "customer":
        cmp = String(a.customer_name).localeCompare(String(b.customer_name));
        break;
      case "delivery_date":
        cmp = String(a.delivered_at || "").localeCompare(String(b.delivered_at || ""));
        break;
      case "return_date":
        cmp = String(a.returned_at || "").localeCompare(String(b.returned_at || ""));
        break;
      case "collected":
        cmp = Number(a.security_collected) - Number(b.security_collected);
        break;
      case "held":
        cmp = Number(a.security_held || 0) - Number(b.security_held || 0);
        break;
      case "status":
        cmp = String(a.status).localeCompare(String(b.status));
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "customer" || key === "status" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: typeof sortKey) {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const statusCounts: Record<string, number> = {};
  for (const b of rows) {
    const s = String(b.status);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Security Deposit</h3></div>
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
        {data?.from && data?.to && (
          <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
            Bookings delivered between {data.from} and {data.to} with security collected.
          </p>
        )}
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
                <FinanceChartSection title="By Status">
                  <FinanceChart type="doughnut" labels={Object.keys(statusCounts)} values={Object.values(statusCounts)} title="By Status" height={240} />
                </FinanceChartSection>
              </div>
            )}
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("serial")}>
                    Serial{sortIndicator("serial")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("customer")}>
                    Customer{sortIndicator("customer")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("delivery_date")}>
                    Delivery{sortIndicator("delivery_date")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("return_date")}>
                    Return{sortIndicator("return_date")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("collected")}>
                    Collected{sortIndicator("collected")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("held")}>
                    Held{sortIndicator("held")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("status")}>
                    Status{sortIndicator("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={String(b.id)}>
                    <td>{String(b.serial).padStart(2, "0")}</td>
                    <td>{String(b.customer_name)}</td>
                    <td>{String(b.delivery_date || "—")}</td>
                    <td>{String(b.return_date || "—")}</td>
                    <td>₹{formatInr(Number(b.security_collected))}</td>
                    <td>₹{formatInr(Number(b.security_held || 0))}</td>
                    <td>{String(b.status)}</td>
                  </tr>
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
  const revenue = cats.map((c) => numberValue(c.total_sale));
  const purchases = cats.map((c) => numberValue(c.net_purchase));
  const pieCats = cats.filter((c) => numberValue(c.total_sale) > 0);
  const pieLabels = pieCats.map((c) => String(c.category));
  const pieRevenue = pieCats.map((c) => numberValue(c.total_sale));

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
              <FinanceChartSection title="Revenue by Category">
                <FinanceChart
                  type="pie"
                  labels={pieLabels}
                  values={pieRevenue}
                  title="Revenue by Category"
                  height={300}
                />
              </FinanceChartSection>
              <FinanceChartSection title="Revenue vs Stock">
                <FinanceCompareChart labels={labels} revenue={revenue} purchases={purchases} />
              </FinanceChartSection>
            </div>
          </div>
        )}
        {!loading && !error && cats.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No category data for this date range.</p>
        )}
        {data && !loading && cats.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Category</th><th>Successful Bookings</th><th>Stock Purchased</th><th>Advance</th><th>Remaining</th><th>Revenue</th><th>Stock Count</th></tr></thead>
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

export function FinanceInventoryProfitability({
  monthStartIso,
  todayIso,
}: {
  monthStartIso: string;
  todayIso: string;
}) {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [sortKey, setSortKey] = useState<
    "category" | "item_count" | "total_sale" | "total_purchase" | "net"
  >("total_sale");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<{
    from?: string;
    to?: string;
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
    fetchFinanceJson<NonNullable<typeof data>>(
      `/api/finance/inventory-profitability?from=${from}&to=${to}`,
    )
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const categoryRows = [...(data?.category_breakdown || [])].sort((a, b) => {
    const netA = a.total_sale - a.total_purchase;
    const netB = b.total_sale - b.total_purchase;
    let cmp = 0;
    switch (sortKey) {
      case "category":
        cmp = a.category.localeCompare(b.category);
        break;
      case "item_count":
        cmp = a.item_count - b.item_count;
        break;
      case "total_sale":
        cmp = a.total_sale - b.total_sale;
        break;
      case "total_purchase":
        cmp = a.total_purchase - b.total_purchase;
        break;
      case "net":
        cmp = netA - netB;
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "category" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: typeof sortKey) {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  }
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
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
          Category-wise rental revenue vs stock purchased for the selected date range.
          {data?.from && data?.to ? ` (${data.from} to ${data.to})` : ""}
        </p>

        <FinanceStatus loading={loading} error={error} />

        {data && !loading && (
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card primary" style={{ padding: 20 }}>
              <div className="stat-value">₹{formatInr(data.totals.totalRevenue)}</div>
              <div className="stat-label">Total Sale (range)</div>
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
              <FinanceChartSection title="Sale by Category">
                <FinanceChart
                  type="pie"
                  labels={catLabels}
                  values={catSales}
                  title="Sale by Category"
                  height={300}
                />
              </FinanceChartSection>
              <FinanceChartSection title="Category Sale vs Purchase">
                <FinanceCompareChart
                  labels={catLabels}
                  revenue={catSales}
                  purchases={catPurchases}
                  title="Category Sale vs Purchase"
                />
              </FinanceChartSection>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("category")}>
                    Category{sortIndicator("category")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("item_count")}>
                    Items in Stock{sortIndicator("item_count")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("total_sale")}>
                    Total Sale{sortIndicator("total_sale")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("total_purchase")}>
                    Total Purchase{sortIndicator("total_purchase")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("net")}>
                    Net (Sale − Purchase){sortIndicator("net")}
                  </th>
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
