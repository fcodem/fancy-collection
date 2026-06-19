"use client";

import { useEffect, useState } from "react";
import { formatInr } from "@/lib/format";

export default function StaffWorkClient({ todayIso }: { todayIso: string }) {
  const [from, setFrom] = useState(`${todayIso.slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso);
  const [rows, setRows] = useState<Array<{ name: string; bookings: number; dresses: number; amount: number }>>([]);

  useEffect(() => {
    fetch(`/api/staff-work?from=${from}&to=${to}`).then((r) => r.json()).then(setRows);
  }, [from, to]);

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Staff Work Report</h3></div>
      <div className="card-body">
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <table className="data-table">
          <thead><tr><th>Staff</th><th>Bookings</th><th>Dresses</th><th>Amount (₹)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}><td><strong>{r.name}</strong></td><td>{r.bookings}</td><td>{r.dresses}</td><td>₹{formatInr(Math.round(r.amount))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
