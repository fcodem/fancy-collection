"use client";

import { useCallback, useEffect, useState } from "react";

type LogEntry = {
  id: number;
  username: string;
  action: string;
  entity: string;
  entityId: number | null;
  label: string | null;
  dataBefore: Record<string, unknown> | null;
  dataAfter: Record<string, unknown> | null;
  createdAt: string;
};

type LogResponse = {
  logs: LogEntry[];
  total: number;
  page: number;
  totalPages: number;
};

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  created:   { bg: "rgba(46,125,50,0.10)", text: "#2E7D32", icon: "fa-plus" },
  updated:   { bg: "rgba(21,101,192,0.10)", text: "#1565C0", icon: "fa-pen" },
  deleted:   { bg: "rgba(198,40,40,0.10)", text: "#C62828", icon: "fa-trash" },
  cancelled: { bg: "rgba(198,40,40,0.10)", text: "#C62828", icon: "fa-ban" },
  delivered: { bg: "rgba(230,81,0,0.10)", text: "#E65100", icon: "fa-truck" },
  returned:  { bg: "rgba(21,101,192,0.10)", text: "#1565C0", icon: "fa-rotate-left" },
  restored:  { bg: "rgba(46,125,50,0.10)", text: "#2E7D32", icon: "fa-undo" },
  packed:    { bg: "rgba(106,27,154,0.10)", text: "#6A1B9A", icon: "fa-box" },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_COLORS[action] || { bg: "var(--cream-dark)", text: "var(--text-muted)", icon: "fa-circle" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 6, fontSize: 11, fontWeight: 700, background: style.bg, color: style.text,
    }}>
      <i className={`fa-solid ${style.icon}`} style={{ fontSize: 10 }} />
      {action.toUpperCase()}
    </span>
  );
}

function EntityBadge({ entity }: { entity: string }) {
  const col = entity === "booking" ? "var(--primary)" : entity === "inventory" ? "#6A1B9A" : "var(--text-muted)";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: col, textTransform: "capitalize" }}>
      {entity.replace(/_/g, " ")}
    </span>
  );
}

function DiffView({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null;
  const allKeys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  if (!allKeys.length) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No field changes</span>;

  return (
    <div style={{ fontSize: 12, lineHeight: 1.8, fontFamily: "monospace" }}>
      {allKeys.map((key) => {
        const bVal = before?.[key] ?? "—";
        const aVal = after?.[key] ?? "—";
        const bStr = typeof bVal === "object" ? JSON.stringify(bVal) : String(bVal);
        const aStr = typeof aVal === "object" ? JSON.stringify(aVal) : String(aVal);
        const changed = bStr !== aStr;
        return (
          <div key={key} style={{ display: "flex", gap: 8, padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ minWidth: 150, fontWeight: 600, color: "var(--text-muted)" }}>{key}</span>
            {before && after ? (
              <>
                <span style={{ flex: 1, color: changed ? "#C62828" : "var(--text-muted)", textDecoration: changed ? "line-through" : "none" }}>
                  {bStr.length > 80 ? bStr.slice(0, 80) + "…" : bStr}
                </span>
                <span style={{ flex: 1, color: changed ? "#2E7D32" : "var(--text-muted)", fontWeight: changed ? 600 : 400 }}>
                  {aStr.length > 80 ? aStr.slice(0, 80) + "…" : aStr}
                </span>
              </>
            ) : (
              <span style={{ flex: 1, color: before ? "#C62828" : "#2E7D32" }}>
                {(before ? bStr : aStr).length > 120 ? (before ? bStr : aStr).slice(0, 120) + "…" : (before ? bStr : aStr)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ActivityLogClient() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [includeOwner, setIncludeOwner] = useState(false);

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "40" });
      if (entityFilter) params.set("entity", entityFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (searchQ.trim()) params.set("q", searchQ.trim());
      if (includeOwner) params.set("include_owner", "1");
      const res = await fetch(`/api/admin/activity-log?${params}`);
      if (!res.ok) return;
      const data: LogResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [entityFilter, actionFilter, searchQ, includeOwner]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true,
    });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)", marginBottom: 6 }}>
          <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 10 }} />
          Activity Log
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          {includeOwner
            ? "Showing all activity — staff and owner changes."
            : "Showing staff activity only. Owner changes are hidden unless you enable the option below."}
          <strong style={{ marginLeft: 6 }}>{total} records</strong>
        </p>
      </div>

      {/* Staff / owner scope */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              <i className="fa-solid fa-users" style={{ marginRight: 8, color: "var(--primary)" }} />
              {includeOwner ? "Staff + owner activity" : "Staff activity only"}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Track changes made by shop staff. Turn on owner view to audit your own work as well.
            </p>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: includeOwner ? "rgba(212,175,55,0.12)" : "var(--cream-dark)",
            }}
          >
            <input
              type="checkbox"
              checked={includeOwner}
              onChange={(e) => setIncludeOwner(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
            />
            Also show owner activity
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select className="form-control" style={{ maxWidth: 160 }} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">All Entities</option>
            <option value="booking">Booking</option>
            <option value="inventory">Inventory</option>
            <option value="booking_item">Booking Item</option>
          </select>
          <select className="form-control" style={{ maxWidth: 160 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All Actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="cancelled">Cancelled</option>
            <option value="delivered">Delivered</option>
            <option value="returned">Returned</option>
            <option value="packed">Packed</option>
          </select>
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, label, or user..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn btn-outline btn-sm" onClick={() => fetchLogs(1)}>
            <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 6 }} />Search
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 28, color: "var(--primary)" }} />
        </div>
      )}

      {/* Empty */}
      {!loading && logs.length === 0 && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            <i className="fa-solid fa-clipboard-list" style={{ fontSize: 36, color: "var(--text-muted)", marginBottom: 12 }} />
            <p style={{ color: "var(--text-muted)" }}>
              {includeOwner
                ? "No activity logs found for the current filters."
                : "No staff activity found. Enable “Also show owner activity” above if you were looking for your own changes."}
            </p>
          </div>
        </div>
      )}

      {/* Log entries */}
      {!loading && logs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map((log) => {
            const expanded = expandedId === log.id;
            const hasDiff = log.dataBefore || log.dataAfter;
            return (
              <div
                key={log.id}
                className="card"
                style={{ cursor: hasDiff ? "pointer" : "default", transition: "box-shadow 0.15s", ...(expanded ? { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } : {}) }}
                onClick={() => hasDiff && setExpandedId(expanded ? null : log.id)}
              >
                <div className="card-body" style={{ padding: "12px 18px" }}>
                  {/* Top row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <ActionBadge action={log.action} />
                    <EntityBadge entity={log.entity} />
                    {log.entityId && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{log.entityId}</span>
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.label || "—"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                        <i className="fa-solid fa-user" style={{ marginRight: 5, fontSize: 10 }} />
                        {log.username}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {formatTime(log.createdAt)}
                      </span>
                      {hasDiff && (
                        <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 11, color: "var(--text-muted)" }} />
                      )}
                    </div>
                  </div>

                  {/* Expanded diff */}
                  {expanded && hasDiff && (
                    <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--cream-dark)", borderRadius: 8, overflow: "auto" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
                        {log.dataBefore && log.dataAfter ? (
                          <>
                            <span style={{ minWidth: 150 }}>Field</span>
                            <span style={{ flex: 1, color: "#C62828" }}>Before</span>
                            <span style={{ flex: 1, color: "#2E7D32" }}>After</span>
                          </>
                        ) : (
                          <>
                            <span style={{ minWidth: 150 }}>Field</span>
                            <span style={{ flex: 1 }}>Value</span>
                          </>
                        )}
                      </div>
                      <DiffView before={log.dataBefore} after={log.dataAfter} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
          <button
            className="btn btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => fetchLogs(page - 1)}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => fetchLogs(page + 1)}
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        </div>
      )}
    </div>
  );
}
