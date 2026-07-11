"use client";

import { useCallback, useEffect, useState } from "react";

type IndexStatus = {
  total: number;
  indexed: number;
  pending: number;
  vectorIndexed?: number;
  queue?: { pending: number };
  pipelineVersion?: number;
};

type LifecycleStatus = {
  ready: number;
  processing: number;
  pending: number;
  failed: number;
  stale: number;
  needsReindex: number;
  currentVersions: { pipeline: number; recognition: number; matching: number };
};

type FingerprintView = {
  itemId: number;
  sku: string;
  name: string;
  status: string;
  qualityScore: number | null;
  recognitionVersion: number;
  fingerprint: Record<string, unknown> | null;
};

function AiBadge({ status }: { status: string }) {
  const tone =
    status === "READY"
      ? { bg: "#c6f6d5", color: "#1a7a3c" }
      : status === "PROCESSING" || status === "PENDING"
        ? { bg: "#fefcbf", color: "#975a16" }
        : status === "STALE"
          ? { bg: "#feebc8", color: "#c05621" }
          : { bg: "#fed7d7", color: "#c53030" };
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

export default function RecognitionAdminClient() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [itemId, setItemId] = useState("");
  const [fingerprint, setFingerprint] = useState<FingerprintView | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [embedding, setEmbedding] = useState<Record<string, unknown> | null>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<Record<string, unknown> | null>(null);

  const refreshStatus = useCallback(() => {
    fetch("/api/admin/recognition/rebuild", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    fetch("/api/admin/dress-checker/lifecycle", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(setLifecycle)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function lifecycleAction(
    action: "reindex_one" | "reindex_all" | "reindex_full" | "repair_failed",
    extra?: { itemId?: number },
  ) {
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/dress-checker/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
        credentials: "same-origin",
      });
      const data = await res.json();
      setMessage(data.message || data.error || "Done.");
      refreshStatus();
    } catch {
      setMessage("Dress checker action failed.");
    } finally {
      setRunning(false);
    }
  }

  async function rebuildAll(force: boolean) {
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/recognition/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
        credentials: "same-origin",
      });
      const data = await res.json();
      setMessage(data.message || "Done.");
      refreshStatus();
    } catch {
      setMessage("Rebuild failed.");
    } finally {
      setRunning(false);
    }
  }

  async function rebuildSelected() {
    const ids = itemId
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter(Boolean);
    if (!ids.length) return;
    setRunning(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/recognition/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids }),
        credentials: "same-origin",
      });
      const data = await res.json();
      setMessage(data.message || "Done.");
      refreshStatus();
    } catch {
      setMessage("Rebuild failed.");
    } finally {
      setRunning(false);
    }
  }

  async function retryFailed() {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/recognition/retry-failed", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      setMessage(data.message || "Retry queued.");
      refreshStatus();
    } catch {
      setMessage("Retry failed.");
    } finally {
      setRunning(false);
    }
  }

  async function loadQueue() {
    const res = await fetch("/api/admin/recognition/queue", { credentials: "same-origin" });
    setQueueSnapshot(await res.json());
  }

  async function loadFingerprint() {
    const id = parseInt(itemId.trim(), 10);
    if (!id) return;
    const res = await fetch(`/api/admin/recognition/${id}/fingerprint`, {
      credentials: "same-origin",
    });
    setFingerprint(await res.json());
  }

  async function loadMetadata() {
    const id = parseInt(itemId.trim(), 10);
    if (!id) return;
    const res = await fetch(`/api/admin/recognition/${id}/metadata`, {
      credentials: "same-origin",
    });
    setMetadata(await res.json());
  }

  async function loadEmbedding() {
    const id = parseInt(itemId.trim(), 10);
    if (!id) return;
    const res = await fetch(`/api/admin/recognition/${id}/embedding`, {
      credentials: "same-origin",
    });
    setEmbedding(await res.json());
  }

  async function compareFingerprints() {
    const a = parseInt(compareA, 10);
    const b = parseInt(compareB, 10);
    if (!a || !b) return;
    const res = await fetch("/api/admin/recognition/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemA: a, itemB: b }),
      credentials: "same-origin",
    });
    setCompareResult(await res.json());
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-shield-halved" style={{ marginRight: 8 }} />
            Dress Checker Profile Lifecycle
          </h3>
        </div>
        <div className="card-body">
          {lifecycle && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
              <AiBadge status="READY" /> {lifecycle.ready}
              {" · "}
              <AiBadge status="PROCESSING" /> {lifecycle.processing}
              {" · "}
              <AiBadge status="PENDING" /> {lifecycle.pending}
              {" · "}
              <AiBadge status="FAILED" /> {lifecycle.failed}
              {" · "}
              <AiBadge status="STALE" /> {lifecycle.stale}
              {" · "}
              needsReindex {lifecycle.needsReindex}
              {" · "}
              engine v{lifecycle.currentVersions.pipeline}
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0 }}>
            Search only uses <strong>READY</strong> profiles. Incomplete profiles show
            &quot;AI profile incomplete. Reindex required.&quot;
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={running}
              onClick={() => void lifecycleAction("reindex_all")}
            >
              Reindex Incomplete
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={running}
              onClick={() => void lifecycleAction("reindex_full")}
            >
              Reindex All
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={running}
              onClick={() => void lifecycleAction("repair_failed")}
            >
              Repair Failed Profiles
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={running || !itemId.trim()}
              onClick={() => {
                const id = parseInt(itemId.trim(), 10);
                if (id) void lifecycleAction("reindex_one", { itemId: id });
              }}
            >
              Reindex Dress
            </button>
          </div>
          {message && <p style={{ fontSize: 13, color: "var(--text)" }}>{message}</p>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-fingerprint" style={{ marginRight: 8 }} />
            AI Recognition Fingerprints (catalog metadata)
          </h3>
        </div>
        <div className="card-body">
          {status && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
              {status.indexed} / {status.total} items indexed
              {status.pipelineVersion ? ` · pipeline v${status.pipelineVersion}` : ""}
              {status.vectorIndexed != null ? ` · vectors ${status.vectorIndexed}` : ""}
              {status.pending > 0 ? ` · ${status.pending} pending` : ""}
              {status.queue?.pending ? ` · queue ${status.queue.pending}` : ""}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={running || status?.pending === 0}
              onClick={() => void rebuildAll(false)}
            >
              {running ? "Processing…" : "Rebuild Pending"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={running}
              onClick={() => void rebuildAll(true)}
            >
              Rebuild All AI Fingerprints
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void retryFailed()}>
              Retry Failed Jobs
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadQueue()}>
              AI Queue Monitor
            </button>
          </div>
          {queueSnapshot && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 180,
                overflow: "auto",
                background: "var(--bg)",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {JSON.stringify(queueSnapshot, null, 2)}
            </pre>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">Selected Items &amp; Fingerprint Viewer</h3>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Item ID(s) comma-separated"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void rebuildSelected()}>
              Rebuild Selected
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadFingerprint()}>
              View Fingerprint
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadMetadata()}>
              AI Metadata Viewer
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadEmbedding()}>
              Embedding Inspector
            </button>
          </div>
          {fingerprint && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 280,
                overflow: "auto",
                background: "var(--bg)",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {JSON.stringify(fingerprint, null, 2)}
            </pre>
          )}
          {metadata && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 280,
                overflow: "auto",
                background: "var(--bg)",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {JSON.stringify(metadata, null, 2)}
            </pre>
          )}
          {embedding && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 280,
                overflow: "auto",
                background: "var(--bg)",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {JSON.stringify(embedding, null, 2)}
            </pre>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Compare Fingerprints</h3>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Item A"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <input
              className="form-input"
              placeholder="Item B"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void compareFingerprints()}>
              Compare
            </button>
          </div>
          {compareResult && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 280,
                overflow: "auto",
                background: "var(--bg)",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {JSON.stringify(compareResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
