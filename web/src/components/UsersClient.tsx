"use client";

import { useEffect, useState } from "react";

export default function UsersClient() {
  const [data, setData] = useState<{ users: Array<Record<string, unknown>>; staff_list: Array<{ id: number; name: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  async function approveLogin(reqId: number) {
    await fetch(`/api/staff-login-request/${reqId}/approve`, { method: "POST" });
    window.location.reload();
  }

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <div className="card">
        <div className="card-header"><h3 className="card-title">User Accounts</h3></div>
        <div className="card-body p-0">
          <table className="data-table">
            <thead><tr><th>Username</th><th>Role</th><th>Staff</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id as number}>
                  <td>{u.username as string}</td>
                  <td>{u.role as string}</td>
                  <td>{(u.staff as { name?: string })?.name || "—"}</td>
                  <td>{u.active ? "Yes" : "No"}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={async () => {
                      const role = prompt("New role (owner/staff):", u.role as string);
                      if (role) await fetch(`/api/users/${u.id}/change-role`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
                      window.location.reload();
                    }}>Role</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
