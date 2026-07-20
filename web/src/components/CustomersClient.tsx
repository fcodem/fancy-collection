"use client";

import Link from "next/link";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      setRows(await res.json());
    } catch {
      /* ignore transient network errors */
    }
  }, [q]);

  useEffect(() => { load(); }, []);

  useRealtimeRefresh(BOOKING_EVENTS, load);

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/customers/bulk-import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Imported ${data.created} new, merged ${data.merged} duplicates, skipped ${data.skipped} invalid rows.`);
        load();
      } else {
        setImportResult(`Error: ${data.error || "Import failed"}`);
      }
    } catch {
      setImportResult("Import failed — network error.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Customers</h3>
          <Link href="/customers/add" className="btn btn-primary btn-sm">Add Customer</Link>
        </div>
        <div className="card-body">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
            Each phone number from bookings is shown as a separate row for easy broadcast. Duplicate contacts are merged on import.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input className="form-control" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
            <button className="btn btn-primary" onClick={load}>Search</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download endpoint */}
            <a href="/api/customers/export/whatsapp" className="btn btn-outline">
              <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
              Export AiSensy CSV
            </a>
            <label className="btn btn-outline" style={{ cursor: "pointer", margin: 0 }}>
              <i className="fa-solid fa-file-import" style={{ marginRight: 6 }} />
              {importing ? "Importing…" : "Import Excel/PDF"}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                style={{ display: "none" }}
                onChange={handleBulkImport}
                disabled={importing}
              />
            </label>
          </div>
          {importResult && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 13,
                background: importResult.startsWith("Error") ? "var(--bg-danger, #fee2e2)" : "var(--bg-success, #dcfce7)",
                color: importResult.startsWith("Error") ? "var(--text-danger, #dc2626)" : "var(--text-success, #16a34a)",
              }}
            >
              {importResult}
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-body p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone No.</th>
                <th>Email</th>
                <th>Address</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, idx) => (
                <tr key={`${c.phone}-${c.id}-${idx}`}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.phone ? c.phone : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.address || "—"}</td>
                  <td>
                    {c.id > 0 ? (
                      <PrefetchOnIntentLink href={`/customers/${c.id}`} className="btn btn-sm btn-outline">View</PrefetchOnIntentLink>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>From bookings</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No customers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
