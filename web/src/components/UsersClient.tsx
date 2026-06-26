"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";

type UserRow = {
  id: number;
  username: string;
  role: string;
  active: boolean;
  staff?: { name?: string } | null;
};

type ActiveSession = {
  id: number;
  user_id: number;
  username: string;
  staff_name: string;
  login_at: string;
  last_seen: string;
};

type PendingRequest = {
  id: number;
  username: string;
  staff_name: string;
  requested_at: string;
};

type ActivitySnippet = {
  id: number;
  action: string;
  entity: string;
  label: string | null;
  createdAt: string;
};

type UsersPayload = {
  users: UserRow[];
  staff_list: Array<{ id: number; name: string }>;
  active_sessions: ActiveSession[];
  pending_requests: PendingRequest[];
  recent_activity: Record<string, ActivitySnippet[]>;
};

function formatDt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const ACTION_SHORT: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  cancelled: "Cancelled",
  postponed: "Postponed",
  delivered: "Delivered",
  returned: "Returned",
  restored: "Restored",
  packed: "Packed",
  attendance: "Attendance",
};

export default function UsersClient() {
  const toast = useToast();
  const [data, setData] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOutId, setLoggingOutId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await fetchJson<UsersPayload>("/api/users");
      setData(payload);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  async function forceLogout(sessionId: number, username: string) {
    if (!confirm(`Log out ${username}? They will need owner approval to sign in again.`)) return;
    setLoggingOutId(sessionId);
    try {
      await fetchJson(`/api/staff-session/${sessionId}/force-logout`, { method: "POST" });
      toast(`${username} logged out`, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Logout failed", "error");
    } finally {
      setLoggingOutId(null);
    }
  }

  async function approveLogin(reqId: number) {
    try {
      await fetchJson(`/api/staff-login-request/${reqId}/approve`, { method: "POST" });
      toast("Login approved", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function rejectLogin(reqId: number) {
    try {
      await fetchJson(`/api/staff-login-request/${reqId}/reject`, { method: "POST" });
      toast("Login denied", "info");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 28, color: "var(--primary)" }} />
      </div>
    );
  }

  if (!data) return <div className="alert alert-error">Could not load users.</div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)", marginBottom: 6 }}>
          <i className="fa-solid fa-user-shield" style={{ marginRight: 10 }} />
          Manage Users
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Active staff sessions, login times, recent activity, and user accounts. List refreshes every 20 seconds.
        </p>
      </div>

      {/* Active logins */}
      <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid var(--success)" }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-circle" style={{ color: "var(--success)", fontSize: 10, marginRight: 8 }} />
            Active Staff Logins ({data.active_sessions.length})
          </h3>
        </div>
        <div className="card-body p-0">
          {data.active_sessions.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", margin: 0 }}>
              No staff currently logged in. When staff log out, they are removed from this list automatically.
            </p>
          ) : (
            data.active_sessions.map((s) => {
              const acts = data.recent_activity[s.username] || [];
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)" }}>
                        {s.username}
                        <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 13, marginLeft: 8 }}>
                          ({s.staff_name})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.6 }}>
                        <div>
                          <i className="fa-solid fa-right-to-bracket" style={{ width: 16, marginRight: 6 }} />
                          <strong>Logged in:</strong> {formatDt(s.login_at)}
                        </div>
                        <div>
                          <i className="fa-solid fa-clock" style={{ width: 16, marginRight: 6 }} />
                          <strong>Last active:</strong> {formatDt(s.last_seen)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={loggingOutId === s.id}
                      onClick={() => forceLogout(s.id, s.username)}
                    >
                      {loggingOutId === s.id ? (
                        <><i className="fa-solid fa-spinner fa-spin" /> Logging out…</>
                      ) : (
                        <><i className="fa-solid fa-right-from-bracket" /> Force Log Out</>
                      )}
                    </button>
                  </div>

                  {acts.length > 0 && (
                    <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--cream-dark)", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                        Recent activity by this login
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                        {acts.map((a) => (
                          <li key={a.id} style={{ fontSize: 12, lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 700, color: "var(--primary)" }}>
                              {ACTION_SHORT[a.action] || a.action}
                            </span>
                            {" · "}
                            <span style={{ color: "var(--text-muted)" }}>{formatDt(a.createdAt)}</span>
                            {a.label && (
                              <span style={{ color: "var(--text)" }}> — {a.label}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={`/activity-log?q=${encodeURIComponent(s.username)}`}
                        style={{ fontSize: 11, fontWeight: 600, marginTop: 8, display: "inline-block" }}
                      >
                        View full activity log →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pending login requests */}
      {data.pending_requests.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid var(--gold)" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "var(--gold-dark)" }}>
              <i className="fa-solid fa-user-clock" style={{ marginRight: 8 }} />
              Pending Login Requests ({data.pending_requests.length})
            </h3>
          </div>
          <div className="card-body p-0">
            {data.pending_requests.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.username}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {p.staff_name} · Requested {formatDt(p.requested_at)}
                  </div>
                </div>
                <span>
                  <button type="button" className="btn btn-sm btn-success" style={{ marginRight: 8 }} onClick={() => approveLogin(p.id)}>
                    Allow Login
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => rejectLogin(p.id)}>
                    Deny
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All accounts */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">All User Accounts</h3></div>
        <div className="card-body p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Staff Name</th>
                <th>Active</th>
                <th>Online</th>
                <th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const online = data.active_sessions.some((s) => s.user_id === u.id);
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.role}</td>
                    <td>{u.staff?.name || "—"}</td>
                    <td>{u.active ? "Yes" : "No"}</td>
                    <td>
                      {online ? (
                        <span style={{ color: "var(--success)", fontWeight: 700, fontSize: 12 }}>
                          <i className="fa-solid fa-circle" style={{ fontSize: 8, marginRight: 6 }} />
                          Logged in
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="no-print">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={async () => {
                          const role = prompt("New role (owner/staff):", u.role);
                          if (!role) return;
                          try {
                            await fetchJson(`/api/users/${u.id}/change-role`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role }),
                            });
                            toast("Role updated", "success");
                            await load();
                          } catch (e) {
                            toast(e instanceof Error ? e.message : "Failed", "error");
                          }
                        }}
                      >
                        Change Role
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
