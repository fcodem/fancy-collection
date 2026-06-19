"use client";

import { useEffect, useState } from "react";
import { formatInr } from "@/lib/format";

export default function SuppliersClient() {
  const [suppliers, setSuppliers] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch("/api/finance/suppliers");
    setSuppliers(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName("");
    load();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3 className="card-title">Add Supplier</h3></div>
        <div className="card-body">
          <form onSubmit={addSupplier} style={{ display: "flex", gap: 12 }}>
            <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" required />
            <button className="btn btn-primary">Add</button>
          </form>
        </div>
      </div>
      {suppliers.map((s) => {
        const purchases = (s.purchases as Array<{ id: number; itemDescription: string; amount: number; transactionType: string; date: string }>) || [];
        const total = purchases.reduce((sum, p) => sum + p.amount, 0);
        return (
          <div key={s.id as number} className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">{s.name as string}</h3><span>Total: ₹{formatInr(total)}</span></div>
            <div className="card-body p-0">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Amount</th><th>Type</th><th>Date</th></tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}><td>{p.itemDescription}</td><td>₹{formatInr(p.amount)}</td><td>{p.transactionType}</td><td>{p.date?.slice?.(0, 10) || p.date}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
