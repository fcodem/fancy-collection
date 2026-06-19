"use client";

import { useState } from "react";

export default function ResetDataClient() {
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  async function reset() {
    if (confirm !== "DELETE ALL DATA") {
      setMsg('Type DELETE ALL DATA to confirm.');
      return;
    }
    if (!window.confirm("Delete ALL bookings, inventory, and customers? This cannot be undone.")) return;
    const res = await fetch("/api/admin/reset-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE ALL DATA" }),
    });
    const data = await res.json();
    setMsg(data.error || "All data reset.");
    if (data.ok) window.location.href = "/";
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-header">
        <h3 className="card-title" style={{ color: "var(--danger)" }}>Reset All Data</h3>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Permanently deletes all bookings, inventory items, and customers. Users and staff accounts are kept.
        </p>
        <div>
          <label className="form-label">Type DELETE ALL DATA to confirm</label>
          <input className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {msg && <p style={{ color: msg.includes("reset") ? "var(--success)" : "var(--danger)" }}>{msg}</p>}
        <button type="button" className="btn btn-danger" onClick={reset}>Reset All Data</button>
      </div>
    </div>
  );
}
