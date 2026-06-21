"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CustomersClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  async function load() {
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      setRows(await res.json());
    } catch {
      /* ignore transient network errors */
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Customers</h3>
          <Link href="/customers/add" className="btn btn-primary btn-sm">Add Customer</Link>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12 }}>
            <input className="form-control" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
            <button className="btn btn-primary" onClick={load}>Search</button>
            <a href="/api/customers/export/whatsapp" className="btn btn-outline">Export WhatsApp CSV</a>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-body p-0">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id as number}>
                  <td><strong>{c.name as string}</strong></td>
                  <td>{c.phone as string}</td>
                  <td>{(c.email as string) || "—"}</td>
                  <td>{(c.address as string) || "—"}</td>
                  <td><Link href={`/customers/${c.id}`} className="btn btn-sm btn-outline">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
