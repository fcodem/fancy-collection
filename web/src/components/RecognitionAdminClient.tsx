"use client";

import { useCallback, useEffect, useState } from "react";

type IndexStatus = {
  total: number;
  indexed: number;
  pending: number;
  pipelineVersion?: number;
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

export default function RecognitionAdminClient() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [itemId, setItemId] = useState("");
  const [fingerprint, setFingerprint] = useState<FingerprintView | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareResult, setCompareResult] = useState<Record<string, unknown> | null>(null);

  const refreshStatus = useCallback(() => {
    fetch("/api/admin/recognition/rebuild", { credentials: "same-origin" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

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

  async function loadFingerprint() {
    const id = parseInt(itemId, 10);
    if (!id) return;
    const res = await fetch(`/api/admin/recognition/${id}/fingerprint`, { credentials: "same-origin" });
    const data = await res.json();
    setFingerprint(data);
  }

  async function compareItems() {
    const a = parseInt(compareA, 10);
    const b = parseInt(compareB, 10);
    if (!a || !b) return;
    const res = await fetch("/api/admin/recognition/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemA: a, itemB: b }),
      credentials: "same-origin",
    });
    const data = await res.json();
    setCompareResult(data);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-fingerprint" style={{ marginRight: 8 }} />
            AI Recognition Fingerprints
          </h3>
        </div>
        <div className="card-body">
          {status && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
              {status.indexed} / {status.total} items indexed
              {status.pipelineVersion ? ` · pipeline v${status.pipelineVersion}` : ""}
              {status.pending > 0 ? ` · ${status.pending} pending` : ""}
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
          </div>
          {message && <p style={{ fontSize: 13, color: "var(--text)" }}>{message}</p>}
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
          </div>
          {fingerprint && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 360,
                overflow: "auto",
                background: "var(--bg)",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              {JSON.stringify(fingerprint, null, 2)}
            </pre>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Compare Two Items</h3>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Item A ID"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <input
              className="form-input"
              placeholder="Item B ID"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void compareItems()}>
              Compare
            </button>
          </div>
          {compareResult && (
            <pre
              style={{
                fontSize: 11,
                maxHeight: 240,
                overflow: "auto",
                background: "var(--bg)",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
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
