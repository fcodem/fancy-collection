"use client";

import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";

type StaffRow = { id: number; username: string; staffName: string };

export default function DashboardStaffWidgetsClient({
  pending,
  active,
}: {
  pending: StaffRow[];
  active: StaffRow[];
}) {
  const router = useRouter();
  const toast = useToast();

  async function mutate(url: string, success: string) {
    try {
      await fetchJson(url, { method: "POST" });
      toast(success, "success");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Action failed", "error");
    }
  }

  if (!pending.length && !active.length) return null;
  return (
    <div className="card mb-24">
      <div className="card-header">
        <h3 className="card-title">Owner / Staff</h3>
      </div>
      <div className="card-body p-0">
        {active.map((row) => (
          <div key={`active-${row.id}`} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <strong>{row.username}</strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.staffName} · Logged in</div>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm(`Log out staff ID "${row.username}" immediately?`)) {
                  void mutate(`/api/staff-session/${row.id}/force-logout`, "Staff logged out");
                }
              }}
            >
              Log Out
            </button>
          </div>
        ))}
        {pending.map((row) => (
          <div key={`pending-${row.id}`} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <strong>{row.username}</strong>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.staffName} · Login requested</div>
            </div>
            <button type="button" className="btn btn-success btn-sm" onClick={() => void mutate(`/api/staff-login-request/${row.id}/approve`, "Staff login approved")}>Allow</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void mutate(`/api/staff-login-request/${row.id}/reject`, "Request denied")}>Deny</button>
          </div>
        ))}
      </div>
    </div>
  );
}
