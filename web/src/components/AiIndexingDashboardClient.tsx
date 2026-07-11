"use client";

import { useCallback, useEffect, useState } from "react";

type WorkerHealth = {
  status?: "HEALTHY" | "DEGRADED" | "OFFLINE";
  healthy?: boolean;
  displayLabel?: string;
  mode?: string;
  lastHeartbeatAt?: string | null;
  lastDrainAt?: string | null;
  processedJobsToday?: number;
  heartbeatAgeMs?: number | null;
  lastError?: string | null;
  source?: string | null;
};

type Forensic = {
  workerHealthy: boolean;
  workerDisplayLabel: string;
  workerMode: string;
  heartbeatAge: number | null;
  lastHeartbeatAt: string | null;
  lastQueueDrain: string | null;
  jobsProcessedToday: number;
  pendingJobs: number;
  processingJobs: number;
  retryJobs: number;
  deadLetters: number;
  oldestPendingJobAt: string | null;
  queueAgeSeconds: number | null;
  averageProcessingTimeMs: number | null;
  staleProfiles: number;
  profilesReady: number;
  deploymentSafe: boolean;
  queueSafe: boolean;
  searchSafe: boolean;
};

type Health = {
  ok: boolean;
  blockers: string[];
  profiles: Record<string, number>;
  queue: Record<string, number> & { workerId?: string; deadLetter?: number };
  worker: WorkerHealth;
  infrastructure: Record<string, string>;
  versions: { pipeline: number; matching: number; recognition: number };
};

type Row = {
  itemId: number;
  sku: string;
  name: string;
  aiStatus: string;
  pipelineVersion: string;
  recognitionVersion: number;
  matchingVersion: number;
  lastIndexedAt: string | null;
  error: string | null;
  retryCount: number;
  jobStatus: string | null;
  needsReindex: boolean;
};

function StatusCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: "#fff",
        border: "1px solid #e2e8f0",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 11, color: "#718096", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4 }}>{count}</div>
    </div>
  );
}

function badge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    READY: { bg: "#c6f6d5", color: "#1a7a3c" },
    PROCESSING: { bg: "#fefcbf", color: "#975a16" },
    PENDING: { bg: "#fefcbf", color: "#975a16" },
    RETRYING: { bg: "#feebc8", color: "#c05621" },
    STALE: { bg: "#feebc8", color: "#c05621" },
    FAILED: { bg: "#fed7d7", color: "#c53030" },
    DEAD_LETTER: { bg: "#fed7d7", color: "#c53030" },
  };
  const tone = map[status] || { bg: "#edf2f7", color: "#4a5568" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {status}
    </span>
  );
}

function formatAge(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function workerLabel(worker: WorkerHealth, forensic?: Forensic | null): string {
  if (forensic?.workerDisplayLabel) return forensic.workerDisplayLabel;
  if (worker.displayLabel) return worker.displayLabel;
  if (worker.status === "HEALTHY" || worker.healthy) {
    const mode = worker.mode || "";
    if (mode.includes("LOCAL")) return "ONLINE (local)";
    return "ONLINE (cron)";
  }
  if (worker.status === "DEGRADED") return "DEGRADED (cron)";
  return "OFFLINE";
}

export default function AiIndexingDashboardClient() {
  const [health, setHealth] = useState<Health | null>(null);
  const [forensic, setForensic] = useState<Forensic | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-indexing", { credentials: "same-origin" });
      const text = await res.text();
      if (!text.trim()) {
        setMessage(`AI indexing API returned empty response (${res.status})`);
        return;
      }
      let data: { health?: Health; rows?: Row[]; forensic?: Forensic; error?: string };
      try {
        data = JSON.parse(text) as {
          health?: Health;
          rows?: Row[];
          forensic?: Forensic;
          error?: string;
        };
      } catch {
        setMessage(`AI indexing API returned invalid JSON (${res.status})`);
        return;
      }
      if (!res.ok) {
        setMessage(data.error || `Failed to load (${res.status})`);
        return;
      }
      setHealth(data.health ?? null);
      setForensic(data.forensic ?? null);
      setRows(data.rows || []);
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to refresh AI indexing status");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  async function action(actionName: string, itemIds?: number[]) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/ai-indexing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: actionName, itemIds }),
      });
      const data = await res.json();
      setMessage(data.message || data.error || "Done");
      await refresh();
    } catch {
      setMessage("Action failed");
    } finally {
      setLoading(false);
    }
  }

  const p = health?.profiles || {};
  const workerOnline =
    health?.worker.status === "HEALTHY" ||
    health?.worker.status === "DEGRADED" ||
    !!health?.worker.healthy ||
    forensic?.workerHealthy;

  return (
    <div style={{ marginTop: 20 }}>
      {health && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatusCard label="READY" count={p.READY || 0} color="#1a7a3c" />
            <StatusCard label="PROCESSING" count={p.PROCESSING || 0} color="#975a16" />
            <StatusCard label="FAILED" count={p.FAILED || 0} color="#c53030" />
            <StatusCard label="STALE" count={p.STALE || 0} color="#c05621" />
            <StatusCard label="RETRYING" count={p.RETRYING || 0} color="#dd6b20" />
            <StatusCard label="PENDING" count={p.PENDING || 0} color="#718096" />
          </div>

          <div
            style={{
              padding: 12,
              background: workerOnline && health.ok ? "#f0fff4" : workerOnline ? "#fffff0" : "#fff5f5",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong>AI SYSTEM HEALTH</strong> · engine v{health.versions.pipeline}
            <br />
            Queue Worker: <strong>{workerLabel(health.worker, forensic)}</strong>
            {" · "}
            Mode: {health.worker.mode || forensic?.workerMode || "—"}
            {" · "}
            pgvector: {health.infrastructure.pgvector}
            {" · "}
            Embedding Index: {health.infrastructure.embeddingIndex}
            {" · "}
            Jobs table: {health.infrastructure.jobsTable}
            {health.infrastructure.heartbeatTable
              ? ` · Heartbeat table: ${health.infrastructure.heartbeatTable}`
              : ""}
            <br />
            Last heartbeat:{" "}
            {health.worker.lastHeartbeatAt || forensic?.lastHeartbeatAt || "—"}
            {" ("}
            {formatAge(health.worker.heartbeatAgeMs ?? forensic?.heartbeatAge)}
            {")"}
            {health.worker.source ? ` via ${health.worker.source}` : ""}
            <br />
            Last queue drain: {health.worker.lastDrainAt || forensic?.lastQueueDrain || "—"}
            {" · "}
            Jobs processed today:{" "}
            {health.worker.processedJobsToday ?? forensic?.jobsProcessedToday ?? 0}
            {" · "}
            Dead letters: {health.queue.deadLetter ?? forensic?.deadLetters ?? 0}
            <br />
            Queue: pending {health.queue.pending} · processing {health.queue.processing} · retrying{" "}
            {health.queue.retrying} · failed {health.queue.failed}
            {forensic && (
              <>
                <br />
                Queue age:{" "}
                {forensic.queueAgeSeconds != null ? `${forensic.queueAgeSeconds}s` : "—"}
                {" · "}
                Oldest pending: {forensic.oldestPendingJobAt || "—"}
                {" · "}
                Avg processing:{" "}
                {forensic.averageProcessingTimeMs != null
                  ? `${forensic.averageProcessingTimeMs}ms`
                  : "—"}
                {" · "}
                deploymentSafe={String(forensic.deploymentSafe)} queueSafe=
                {String(forensic.queueSafe)} searchSafe={String(forensic.searchSafe)}
              </>
            )}
            {health.blockers.length > 0 && (
              <>
                <br />
                <span style={{ color: "#c53030" }}>Blockers: {health.blockers.join("; ")}</span>
              </>
            )}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={loading || !selected.length}
          onClick={() => void action("reindex_selected", selected)}
        >
          Reindex Selected
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("reindex_failed")}
        >
          Reindex Failed
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("repair_all")}
        >
          Repair All
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("resume_queue")}
        >
          Resume Queue
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("self_heal")}
        >
          Self-Heal Queue
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("resume_dead_letter")}
        >
          Resume Dead Letters
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => void action("drain_queue")}
        >
          Drain Queue Now
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: 12, fontSize: 13, color: "#2d3748" }}>{message}</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.length === rows.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? rows.map((r) => r.itemId) : [])
                  }
                />
              </th>
              <th>SKU</th>
              <th>Name</th>
              <th>Status</th>
              <th>Job</th>
              <th>Versions</th>
              <th>Retries</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.itemId)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, r.itemId]
                          : prev.filter((id) => id !== r.itemId),
                      )
                    }
                  />
                </td>
                <td>{r.sku}</td>
                <td>{r.name}</td>
                <td>{badge(r.aiStatus)}</td>
                <td>{r.jobStatus ? badge(r.jobStatus) : "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  p{r.pipelineVersion}/r{r.recognitionVersion}/m{r.matchingVersion}
                </td>
                <td>{r.retryCount}</td>
                <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.error || "—"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#718096", padding: 24 }}>
                  All profiles READY — no repair rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
