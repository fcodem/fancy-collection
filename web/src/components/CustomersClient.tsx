"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  whatsapp: string;
  email: string | null;
  address: string | null;
};

export default function CustomersClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);

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
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
            One record per person — merged when contact, WhatsApp, or linked numbers match across bookings.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input className="form-control" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
            <button className="btn btn-primary" onClick={load}>Search</button>
            <a href="/api/customers/export/whatsapp" className="btn btn-outline">
              <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
              Export AiSensy CSV
            </a>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-body p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact No.</th>
                <th>WhatsApp No.</th>
                <th>Email</th>
                <th>Address</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={`${c.phone}-${c.id}`}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.phone ? c.phone : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td>
                    {c.whatsapp ? (
                      <span><i className="fa-brands fa-whatsapp" style={{ marginRight: 6, color: "#25D366" }} />{c.whatsapp}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td>{c.email || "—"}</td>
                  <td>{c.address || "—"}</td>
                  <td>
                    {c.id > 0 ? (
                      <Link href={`/customers/${c.id}`} className="btn btn-sm btn-outline">View</Link>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>From bookings</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No customers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
