"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FinanceChart } from "@/components/finance/FinanceChart";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";
import { formatInr } from "@/lib/format";

type Supplier = {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  gstNo?: string | null;
  accountDetails?: string | null;
  purchases: Array<{
    id: number;
    itemDescription: string;
    category?: string | null;
    amount: number;
    gstAmount: number;
    gstPercent?: number;
    transactionType: string;
    date: string;
    notes?: string | null;
  }>;
};

type Summary = {
  by_category: Record<string, number>;
  total: number;
  total_gst: number;
  count: number;
};

export default function SuppliersClient({
  categories = [],
  saveConfirmed,
}: {
  categories?: string[];
  saveConfirmed?: { title: string; detail?: string };
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", address: "", gst_no: "", account_details: "" });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [stockForms, setStockForms] = useState<Record<number, { category: string; amount: string; gst_percent: string; date: string; notes: string }>>({});

  function getStockForm(id: number) {
    return stockForms[id] ?? { category: "", amount: "", gst_percent: "18", date: new Date().toISOString().slice(0, 10), notes: "" };
  }
  function setStockForm(id: number, patch: Partial<{ category: string; amount: string; gst_percent: string; date: string; notes: string }>) {
    setStockForms((prev) => ({ ...prev, [id]: { ...getStockForm(id), ...patch } }));
  }
  const [compareFrom, setCompareFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [compareTo, setCompareTo] = useState(new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/finance/suppliers");
    if (!res.ok) return;
    const data = await res.json();
    setSuppliers(Array.isArray(data) ? data : []);
  }

  useEffect(() => { load(); }, []);

  async function loadSummary(supplierId: number) {
    const res = await fetch(`/api/finance/suppliers/${supplierId}/summary?from=${dateFrom}&to=${dateTo}`);
    setSummary(await res.json());
  }

  useEffect(() => {
    if (expanded) loadSummary(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, dateFrom, dateTo]);

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/finance/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to save vendor"); return; }
    const vendorName = form.name.trim();
    setForm({ name: "", phone: "", address: "", gst_no: "", account_details: "" });
    load();
    router.replace(
      buildSaveRedirectUrl("/finance/suppliers", {
        title: "Supplier saved",
        detail: vendorName,
      }),
    );
    window.scrollTo(0, 0);
  }

  async function addStock(supplierId: number) {
    const sf = getStockForm(supplierId);
    const amount = Number(sf.amount);
    if (!amount || !sf.category) { alert("Category and amount are required"); return; }
    setSaving(true);
    const gstPercent = Number(sf.gst_percent) || 0;
    const gstAmount = Math.round((amount * gstPercent) / 100);
    const res = await fetch(`/api/finance/suppliers/${supplierId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_description: `${sf.category} stock`,
        category: sf.category,
        amount,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        date: sf.date,
        notes: sf.notes,
      }),
    });
    setSaving(false);
    if (!res.ok) { const e = await res.json(); alert(e.error || "Save failed"); return; }
    setStockForm(supplierId, { category: "", amount: "", gst_percent: "18", date: new Date().toISOString().slice(0, 10), notes: "" });
    load();
    if (expanded === supplierId) loadSummary(supplierId);
  }

  const summaryLabels = summary ? Object.keys(summary.by_category) : [];
  const summaryValues = summary ? Object.values(summary.by_category) : [];

  const vendorComparison = useMemo(() => {
    return suppliers
      .map((s) => {
        const inRange = (s.purchases || []).filter((p) => {
          if (p.transactionType !== "purchase") return false;
          const d = typeof p.date === "string" ? p.date.slice(0, 10) : "";
          return d >= compareFrom && d <= compareTo;
        });
        const by_category: Record<string, number> = {};
        for (const p of inRange) {
          const cat = (p.category || "Other").trim() || "Other";
          by_category[cat] = (by_category[cat] || 0) + p.amount;
        }
        return {
          id: s.id,
          name: s.name,
          total: inRange.reduce((sum, p) => sum + p.amount, 0),
          gst: inRange.reduce((sum, p) => sum + (p.gstAmount || 0), 0),
          count: inRange.length,
          by_category,
        };
      })
      .filter((v) => v.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [suppliers, compareFrom, compareTo]);

  const comparisonTotal = vendorComparison.reduce((s, v) => s + v.total, 0);
  const comparisonCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const v of vendorComparison) {
      for (const cat of Object.keys(v.by_category)) cats.add(cat);
    }
    return [...cats].sort();
  }, [vendorComparison]);

  return (
    <div>
      {saveConfirmed && (
        <SaveConfirmedBanner
          title={saveConfirmed.title}
          detail={saveConfirmed.detail}
          hint="Add another supplier below."
        />
      )}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-chart-bar" style={{ marginRight: 8 }} />
            Vendor Purchase Comparison
          </h3>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label className="form-label">From</label>
              <input type="date" className="form-control" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">To</label>
              <input type="date" className="form-control" value={compareTo} onChange={(e) => setCompareTo(e.target.value)} />
            </div>
            {comparisonTotal > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>₹{formatInr(comparisonTotal)}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total stock purchased (all vendors)</div>
              </div>
            )}
          </div>

          {vendorComparison.length > 0 ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <FinanceChart
                  type="bar"
                  labels={vendorComparison.map((v) => v.name)}
                  values={vendorComparison.map((v) => v.total)}
                  title="Stock Purchase by Vendor"
                  height={Math.max(260, vendorComparison.length * 36)}
                  horizontal
                />
              </div>
              <table className="data-table" style={{ marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Purchases</th>
                    <th>GST</th>
                    <th>Transactions</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorComparison.map((v) => (
                    <tr key={v.id}>
                      <td><strong>{v.name}</strong></td>
                      <td>₹{formatInr(v.total)}</td>
                      <td>₹{formatInr(v.gst)}</td>
                      <td>{v.count}</td>
                      <td>{comparisonTotal > 0 ? `${Math.round((v.total / comparisonTotal) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {comparisonCategories.length > 0 && vendorComparison.length > 1 && (
                <>
                  <h4 style={{ margin: "0 0 12px", fontSize: 15 }}>Category-wise purchase by vendor</h4>
                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          {vendorComparison.map((v) => (
                            <th key={v.id}>{v.name}</th>
                          ))}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonCategories.map((cat) => {
                          const rowTotal = vendorComparison.reduce(
                            (s, v) => s + (v.by_category[cat] || 0),
                            0,
                          );
                          return (
                            <tr key={cat}>
                              <td><strong>{cat}</strong></td>
                              {vendorComparison.map((v) => (
                                <td key={v.id}>
                                  {v.by_category[cat] ? `₹${formatInr(v.by_category[cat])}` : "—"}
                                </td>
                              ))}
                              <td><strong>₹{formatInr(rowTotal)}</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No vendor purchases in this date range.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-truck-field" style={{ marginRight: 8 }} />Add Vendor</h3></div>
        <div className="card-body">
          <form onSubmit={addSupplier}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div><label className="form-label">Vendor Name *</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label className="form-label">Contact No.</label><input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="form-label">GST No.</label><input className="form-control" value={form.gst_no} onChange={(e) => setForm({ ...form, gst_no: e.target.value })} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label className="form-label">Address</label><input className="form-control" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="form-label">Account Details</label><input className="form-control" value={form.account_details} onChange={(e) => setForm({ ...form, account_details: e.target.value })} placeholder="Bank / UPI / Account no." /></div>
            </div>
            <button className="btn btn-primary" disabled={saving}>Save Vendor</button>
          </form>
        </div>
      </div>

      {suppliers.map((s) => {
        const allPurchases = s.purchases || [];
        const totalAll = allPurchases.filter((p) => p.transactionType === "purchase").reduce((sum, p) => sum + p.amount, 0);
        const isOpen = expanded === s.id;

        return (
          <div key={s.id} className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : s.id)}>
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>{s.name}</h3>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {s.phone && <span>{s.phone} · </span>}
                  {s.gstNo && <span>GST: {s.gstNo} · </span>}
                  Total purchases: ₹{formatInr(totalAll)}
                </div>
              </div>
              <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"}`} />
            </div>

            {isOpen && (
              <div className="card-body">
                {(s.address || s.accountDetails) && (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                    {s.address && <div><i className="fa-solid fa-location-dot" style={{ marginRight: 6 }} />{s.address}</div>}
                    {s.accountDetails && <div><i className="fa-solid fa-building-columns" style={{ marginRight: 6 }} />{s.accountDetails}</div>}
                  </div>
                )}

                <div style={{ background: "var(--bg-muted, #f8f9fa)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <h4 style={{ marginBottom: 12, fontSize: 14 }}>Add Stock Purchase</h4>
                  {(() => {
                    const sf = getStockForm(s.id);
                    return (<>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label className="form-label">Category *</label>
                      <select className="form-control" value={sf.category} onChange={(e) => setStockForm(s.id, { category: e.target.value })}>
                        <option value="">Select…</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="form-label">Amount (₹) *</label><input type="number" className="form-control" value={sf.amount} onChange={(e) => setStockForm(s.id, { amount: e.target.value })} /></div>
                    <div><label className="form-label">GST %</label><input type="number" className="form-control" value={sf.gst_percent} onChange={(e) => setStockForm(s.id, { gst_percent: e.target.value })} /></div>
                    <div><label className="form-label">Date</label><input type="date" className="form-control" value={sf.date} onChange={(e) => setStockForm(s.id, { date: e.target.value })} /></div>
                  </div>
                  {sf.amount && sf.gst_percent && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                      GST: ₹{formatInr(Math.round(Number(sf.amount) * Number(sf.gst_percent) / 100))} ·
                      Total: ₹{formatInr(Number(sf.amount) + Math.round(Number(sf.amount) * Number(sf.gst_percent) / 100))}
                    </p>
                  )}
                  </>);
                  })()}
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => addStock(s.id)}>Save Purchase</button>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div><label className="form-label">From</label><input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
                  <div><label className="form-label">To</label><input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
                  {summary && (
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>₹{formatInr(summary.total)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>GST: ₹{formatInr(summary.total_gst)} · {summary.count} purchases</div>
                    </div>
                  )}
                </div>

                {summaryLabels.length > 0 && (
                  <div style={{ marginBottom: 20, maxWidth: 400 }}>
                    <FinanceChart type="pie" labels={summaryLabels} values={summaryValues} title="Category-wise Purchases" height={240} />
                  </div>
                )}

                <table className="data-table">
                  <thead><tr><th>Category</th><th>Amount</th><th>GST</th><th>Date</th><th>Notes</th></tr></thead>
                  <tbody>
                    {allPurchases.map((p) => (
                      <tr key={p.id}>
                        <td>{p.category || p.itemDescription}</td>
                        <td>₹{formatInr(p.amount)}</td>
                        <td>₹{formatInr(p.gstAmount)} {p.gstPercent ? `(${p.gstPercent}%)` : ""}</td>
                        <td>{typeof p.date === "string" ? p.date.slice(0, 10) : ""}</td>
                        <td>{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
