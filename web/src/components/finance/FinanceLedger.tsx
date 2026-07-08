"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFinanceJson } from "@/components/finance/financeFetch";
import { FinanceCompareChart } from "@/components/finance/FinanceChart";
import { formatInr } from "@/lib/format";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";

const EXPENSE_CATEGORIES = ["Staff", "Rent", "Utilities", "Supplies", "Transport", "Miscellaneous"];
const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank Transfer" },
  { value: "card", label: "Card" },
];

function paymentModeLabel(mode: string): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label || mode;
}

type SaleBreakdown = {
  booking_advance: number;
  balance_at_delivery: number;
  balance_at_return: number;
  balance_received: number;
  order_advance: number;
  order_balance_collected: number;
  order_refund: number;
  orders_received: number;
  cancelled_amount: number;
  postponed_amount: number;
  total_sale: number;
  booking_count: number;
};

type ExpenseRow = {
  id: number;
  date: string;
  category: string;
  amount: number;
  payment_mode: string;
  notes: string;
  created_by: string;
  created_at: string;
};

type ExpenseSummary = {
  entries: ExpenseRow[];
  total: number;
  by_category: Record<string, number>;
  by_payment_mode: Record<string, number>;
  count: number;
};

type TrendPoint = { month: string; label: string; sale: number; expense: number; savings: number };

type LedgerData = {
  from: string;
  to: string;
  sale: SaleBreakdown;
  expenses: ExpenseSummary;
  total_sale: number;
  total_expense: number;
  net_savings: number;
  trend: TrendPoint[] | null;
};

type View = "daily" | "monthly" | "custom";

function firstDayOfMonth(m: string): string {
  return `${m}-01`;
}

function lastDayOfMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 0));
  return d.toISOString().slice(0, 10);
}

export default function FinanceLedger({ todayIso, monthIso }: { todayIso: string; monthIso: string }) {
  const toast = useToast();
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(todayIso);
  const [month, setMonth] = useState(monthIso);
  const [from, setFrom] = useState(firstDayOfMonth(monthIso));
  const [to, setTo] = useState(todayIso);

  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  // Add-expense form
  const [exDate, setExDate] = useState(todayIso);
  const [exCategory, setExCategory] = useState("Miscellaneous");
  const [exAmount, setExAmount] = useState("");
  const [exMode, setExMode] = useState("cash");
  const [exNotes, setExNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ExpenseRow>>({});

  useEffect(() => setMounted(true), []);

  function deriveRange(): { from: string; to: string; trendMonth: string } {
    if (view === "daily") return { from: date, to: date, trendMonth: "" };
    if (view === "monthly") return { from: firstDayOfMonth(month), to: lastDayOfMonth(month), trendMonth: month };
    return { from, to, trendMonth: "" };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const range = view === "daily"
      ? { from: date, to: date, trendMonth: "" }
      : view === "monthly"
        ? { from: firstDayOfMonth(month), to: lastDayOfMonth(month), trendMonth: month }
        : { from, to, trendMonth: "" };
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (range.trendMonth) {
      qs.set("trend_month", range.trendMonth);
      qs.set("trend_months", "6");
    }
    try {
      const d = await fetchFinanceJson<LedgerData>(`/api/finance/ledger?${qs.toString()}`);
      setData(d);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [view, date, month, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(exAmount);
    if (!exCategory.trim()) return toast("Choose an expense category", "error");
    if (!Number.isFinite(amt) || amt <= 0) return toast("Enter a valid amount", "error");
    setSaving(true);
    try {
      await fetchJson("/api/finance/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: exDate,
          category: exCategory.trim(),
          amount: amt,
          payment_mode: exMode,
          notes: exNotes.trim() || null,
        }),
      });
      setExAmount("");
      setExNotes("");
      toast("Expense added", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add expense", "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ExpenseRow) {
    setEditId(row.id);
    setEditDraft({ ...row });
  }

  async function saveEdit(id: number) {
    const d = editDraft;
    const amt = Number(d.amount);
    if (!d.category?.trim()) return toast("Category required", "error");
    if (!Number.isFinite(amt) || amt <= 0) return toast("Enter a valid amount", "error");
    try {
      await fetchJson(`/api/finance/ledger/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: d.date,
          category: d.category.trim(),
          amount: amt,
          payment_mode: d.payment_mode,
          notes: d.notes ?? "",
        }),
      });
      setEditId(null);
      setEditDraft({});
      toast("Expense updated", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update", "error");
    }
  }

  async function removeExpense(id: number) {
    if (!confirm("Delete this expense entry?")) return;
    try {
      await fetchJson(`/api/finance/ledger/${id}`, { method: "DELETE" });
      toast("Expense deleted", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  const sale = data?.sale;
  const expenses = data?.expenses;
  const netPositive = (data?.net_savings ?? 0) >= 0;

  const saleRows: Array<{ label: string; value: number; sign: "+" | "-" }> = sale
    ? [
        { label: "Booking Advance", value: sale.booking_advance, sign: "+" },
        { label: "Balance Received (delivery + return)", value: sale.balance_received, sign: "+" },
        { label: "Money Received via Orders", value: sale.orders_received, sign: "+" },
        { label: "Booking Cancelled Amount", value: sale.cancelled_amount, sign: "-" },
        { label: "Postponement Amount", value: sale.postponed_amount, sign: "-" },
      ]
    : [];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-book" style={{ marginRight: 8 }} />
            Ledger
          </h3>
          <div className="btn-group" role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["daily", "monthly", "custom"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`btn btn-sm ${view === v ? "btn-primary" : "btn-outline"}`}
                onClick={() => setView(v)}
                style={{ textTransform: "capitalize" }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            {view === "daily" && (
              <div>
                <label className="form-label">Date</label>
                <input type="date" className="form-control" style={{ maxWidth: 200 }} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            {view === "monthly" && (
              <div>
                <label className="form-label">Month</label>
                <input type="month" className="form-control" style={{ maxWidth: 200 }} value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            )}
            {view === "custom" && (
              <>
                <div>
                  <label className="form-label">From</label>
                  <input type="date" className="form-control" style={{ maxWidth: 180 }} value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" style={{ maxWidth: 180 }} value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {mounted && loading && <p style={{ color: "var(--text-muted)" }}>Loading ledger…</p>}
      {mounted && error && <p className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</p>}

      {data && !loading && (
        <>
          {/* Comparison cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card gold">
              <div className="stat-value">₹{formatInr(data.total_sale)}</div>
              <div className="stat-label">Total Sale</div>
            </div>
            <div className="stat-card danger">
              <div className="stat-value">₹{formatInr(data.total_expense)}</div>
              <div className="stat-label">Total Expense</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{expenses?.count ?? 0} entries</div>
            </div>
            <div className={`stat-card ${netPositive ? "success" : "danger"}`}>
              <div className="stat-value" style={{ color: netPositive ? "var(--success)" : "var(--danger)" }}>
                {netPositive ? "" : "-"}₹{formatInr(Math.abs(data.net_savings))}
              </div>
              <div className="stat-label">Net {netPositive ? "Savings / Profit" : "Loss"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Sale − Expense</div>
            </div>
          </div>

          <div className="two-col" style={{ gap: 16, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
            {/* Sale breakdown */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title"><i className="fa-solid fa-coins" style={{ marginRight: 8 }} />Total Sale Breakdown</h3>
              </div>
              <div className="card-body">
                <table className="table" style={{ width: "100%" }}>
                  <tbody>
                    {saleRows.map((r) => (
                      <tr key={r.label}>
                        <td style={{ color: "var(--text-muted)" }}>
                          {r.sign === "-" ? <span style={{ color: "var(--danger)" }}>−</span> : <span style={{ color: "var(--success)" }}>+</span>} {r.label}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: r.sign === "-" ? "var(--danger)" : "inherit" }}>
                          {r.sign === "-" ? "−" : ""}₹{formatInr(r.value)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ fontWeight: 700 }}>Total Sale</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontSize: 16, color: "var(--gold-dark, #8a6d1a)" }}>₹{formatInr(data.total_sale)}</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Computed live from Bookings, Orders and Cancellations for {data.from === data.to ? data.from : `${data.from} → ${data.to}`}.
                </p>
              </div>
            </div>

            {/* Add expense */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title"><i className="fa-solid fa-plus" style={{ marginRight: 8 }} />Add Expense</h3>
              </div>
              <div className="card-body">
                <form onSubmit={addExpense}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control" value={exDate} onChange={(e) => setExDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <input
                        className="form-control"
                        list="expense-categories"
                        value={exCategory}
                        onChange={(e) => setExCategory(e.target.value)}
                        placeholder="e.g. Rent"
                      />
                      <datalist id="expense-categories">
                        {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" min="0" step="1" className="form-control" value={exAmount} onChange={(e) => setExAmount(e.target.value)} placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Payment Mode</label>
                      <select className="form-control" value={exMode} onChange={(e) => setExMode(e.target.value)}>
                        {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes (optional)</label>
                    <input className="form-control" value={exNotes} onChange={(e) => setExNotes(e.target.value)} placeholder="Description" />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />{saving ? "Saving…" : "Add Expense"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Expense list */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
              <h3 className="card-title"><i className="fa-solid fa-receipt" style={{ marginRight: 8 }} />Expenses ({expenses?.count ?? 0})</h3>
              <span style={{ fontWeight: 700 }}>Total: ₹{formatInr(data.total_expense)}</span>
            </div>
            <div className="card-body" style={{ overflowX: "auto" }}>
              {!expenses?.entries.length ? (
                <p style={{ color: "var(--text-muted)" }}>No expenses logged for this period.</p>
              ) : (
                <table className="table" style={{ width: "100%", minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Mode</th>
                      <th>Notes</th>
                      <th>By</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.entries.map((row) =>
                      editId === row.id ? (
                        <tr key={row.id}>
                          <td><input type="date" className="form-control" style={{ minWidth: 130 }} value={editDraft.date || ""} onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))} /></td>
                          <td><input className="form-control" list="expense-categories" style={{ minWidth: 110 }} value={editDraft.category || ""} onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))} /></td>
                          <td><input type="number" className="form-control" style={{ minWidth: 90 }} value={editDraft.amount ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, amount: Number(e.target.value) }))} /></td>
                          <td>
                            <select className="form-control" value={editDraft.payment_mode || "cash"} onChange={(e) => setEditDraft((d) => ({ ...d, payment_mode: e.target.value }))}>
                              {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </td>
                          <td><input className="form-control" style={{ minWidth: 120 }} value={editDraft.notes || ""} onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))} /></td>
                          <td>{row.created_by || "—"}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button type="button" className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={() => saveEdit(row.id)}>Save</button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditId(null); setEditDraft({}); }}>Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{row.date}</td>
                          <td>{row.category}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>₹{formatInr(row.amount)}</td>
                          <td>{paymentModeLabel(row.payment_mode)}</td>
                          <td style={{ color: "var(--text-muted)" }}>{row.notes || "—"}</td>
                          <td style={{ color: "var(--text-muted)" }}>{row.created_by || "—"}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginRight: 4 }} onClick={() => startEdit(row)}><i className="fa-solid fa-pen" /></button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeExpense(row.id)}><i className="fa-solid fa-trash" /></button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Monthly summary + trend */}
          {view === "monthly" && data.trend && data.trend.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title"><i className="fa-solid fa-chart-line" style={{ marginRight: 8 }} />Monthly Trend (Sale vs Expense)</h3>
              </div>
              <div className="card-body">
                <FinanceCompareChart
                  labels={data.trend.map((t) => t.label)}
                  revenue={data.trend.map((t) => t.sale)}
                  purchases={data.trend.map((t) => t.expense)}
                  title="Monthly Sale vs Expense"
                />
                <table className="table" style={{ width: "100%", marginTop: 16 }}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: "right" }}>Sale</th>
                      <th style={{ textAlign: "right" }}>Expense</th>
                      <th style={{ textAlign: "right" }}>Net Savings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((t) => (
                      <tr key={t.month}>
                        <td>{t.label}</td>
                        <td style={{ textAlign: "right" }}>₹{formatInr(t.sale)}</td>
                        <td style={{ textAlign: "right", color: "var(--danger)" }}>₹{formatInr(t.expense)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: t.savings >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {t.savings < 0 ? "−" : ""}₹{formatInr(Math.abs(t.savings))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expense category split */}
          {expenses && Object.keys(expenses.by_category).length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><i className="fa-solid fa-tags" style={{ marginRight: 8 }} />Expense by Category</h3>
              </div>
              <div className="card-body" style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%" }}>
                  <thead>
                    <tr><th>Category</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(expenses.by_category)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>₹{formatInr(amt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
