"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChangePasswordClient() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/profile/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const data = await res.json();
    if (data.error) setMsg(data.error);
    else { setMsg("Password changed!"); router.push("/"); }
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 480 }}>
      <div className="card-header"><h3 className="card-title">Change Password</h3></div>
      <div className="card-body" style={{ display: "grid", gap: 16 }}>
        <div><label className="form-label">Current Password</label><input type="password" className="form-control" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div><label className="form-label">New Password</label><input type="password" className="form-control" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} /></div>
        {msg && <p style={{ color: msg.includes("changed") ? "var(--success)" : "var(--danger)" }}>{msg}</p>}
        <button className="btn btn-primary">Update Password</button>
      </div>
    </form>
  );
}
