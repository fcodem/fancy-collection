"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

type BackupMeta = {
  app?: string;
  version?: string;
  exported_at?: string;
  exported_by?: string;
  record_counts?: Record<string, number>;
};

type BackupPreview = {
  meta: BackupMeta;
  tableCounts: Record<string, number>;
  fileName: string;
  fileSize: string;
};

type RestoreResult = {
  success: boolean;
  message: string;
  counts?: Record<string, number>;
  log?: string[];
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function countTable(data: unknown): number {
  return Array.isArray(data) ? data.length : 0;
}

export default function RestoreClient() {
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "restoring" | "done" | "error">("idle");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    setPreview(null);
    setRawData(null);
    setResult(null);
    setPhase("idle");
    setConfirmText("");

    if (!file.name.endsWith(".json")) {
      setError("Please select a .json backup file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.meta) {
          setError("Invalid backup file — missing 'meta' object.");
          return;
        }
        const tableCounts: Record<string, number> = {
          "Bookings": countTable(data.bookings),
          "Booking Items": (data.bookings ?? []).reduce(
            (s: number, b: Record<string, unknown>) =>
              s + countTable(b.bookingItems ?? b.booking_items),
            0,
          ),
          "Inventory (Dresses)": countTable(data.inventory),
          "Customers": countTable(data.customers),
          "Staff": countTable(data.staff),
          "Users": countTable(data.users),
          "Custom Categories": countTable(data.custom_categories),
          "Attendance": countTable(data.attendance),
          "Suppliers": countTable(data.suppliers),
          "Supplier Purchases": countTable(data.supplier_purchases),
          "Prospect Leads": countTable(data.prospect_leads),
          "Shop Enquiries": countTable(data.shop_enquiries),
        };
        setPreview({
          meta: data.meta,
          tableCounts,
          fileName: file.name,
          fileSize: formatBytes(file.size),
        });
        setRawData(data);
      } catch {
        setError("Could not parse file. Please check it's a valid JSON backup.");
      }
    };
    reader.readAsText(file);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function executeRestore() {
    if (!rawData) return;
    setPhase("restoring");
    setResult(null);
    try {
      const res = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(rawData),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPhase("done");
        setResult(data);
      } else {
        setPhase("error");
        setResult({ success: false, message: data.error || "Restore failed." });
      }
    } catch {
      setPhase("error");
      setResult({ success: false, message: "Network error. Please try again." });
    }
  }

  function reset() {
    setPreview(null);
    setRawData(null);
    setError(null);
    setPhase("idle");
    setResult(null);
    setConfirmText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canRestore = confirmText.toLowerCase() === "restore";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/reports" className="btn btn-outline btn-sm">
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />Back
        </Link>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#C62828", margin: 0 }}>
            <i className="fa-solid fa-upload" style={{ marginRight: 10 }} />
            Import / Restore Database
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
            Upload a <code>.json</code> backup file to restore all data. This will <strong>replace all existing data</strong>.
          </p>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="card" style={{ borderLeft: "4px solid #C62828", marginBottom: 24, background: "rgba(198,40,40,0.04)" }}>
        <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ color: "#C62828", fontSize: 22, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
            <strong style={{ color: "#C62828" }}>Warning:</strong> Restoring a backup will <strong>permanently delete</strong> all current data
            and replace it with the backup file contents. This action cannot be undone.
            <br />
            <strong>Before proceeding:</strong> Download a fresh backup of your current data from the
            <Link href="/reports" style={{ marginLeft: 4, fontWeight: 600 }}>Reports & Backup</Link> page.
          </div>
        </div>
      </div>

      {/* Success State */}
      {phase === "done" && result && (
        <div className="card" style={{ borderLeft: "4px solid var(--success)", marginBottom: 24 }}>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <i className="fa-solid fa-circle-check" style={{ color: "var(--success)", fontSize: 28 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--success)" }}>Database Restored Successfully</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{result.message}</div>
              </div>
            </div>
            {result.counts && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 20px", fontSize: 13 }}>
                {Object.entries(result.counts).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{k.replace(/_/g, " ")}</span>
                    <strong style={{ color: "var(--success)" }}>{v}</strong>
                  </div>
                ))}
              </div>
            )}
            {result.log && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>Restore Log</summary>
                <pre style={{ fontSize: 11, background: "var(--cream-dark)", padding: 12, borderRadius: 8, marginTop: 8, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }}>
                  {result.log.join("\n")}
                </pre>
              </details>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button className="btn btn-primary" onClick={() => window.location.href = "/"}>
                <i className="fa-solid fa-house" style={{ marginRight: 8 }} />Go to Dashboard
              </button>
              <button className="btn btn-outline" onClick={reset}>Restore Another</button>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {phase === "error" && result && (
        <div className="card" style={{ borderLeft: "4px solid var(--danger)", marginBottom: 24 }}>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <i className="fa-solid fa-circle-xmark" style={{ color: "var(--danger)", fontSize: 28 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--danger)" }}>Restore Failed</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>All changes have been rolled back. Your existing data is safe.</div>
              </div>
            </div>
            <pre style={{ fontSize: 12, background: "rgba(198,40,40,0.05)", padding: 12, borderRadius: 8, color: "#C62828", whiteSpace: "pre-wrap" }}>
              {result.message}
            </pre>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={reset}>Try Again</button>
          </div>
        </div>
      )}

      {/* Restoring Spinner */}
      {phase === "restoring" && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ textAlign: "center", padding: "48px 24px" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 40, color: "var(--primary)", marginBottom: 16 }} />
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--primary)" }}>Restoring Database...</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
              Do not close this page or navigate away. This may take a minute for large datasets.
            </p>
          </div>
        </div>
      )}

      {/* File Upload + Preview — hide during/after restore */}
      {(phase === "idle") && (
        <>
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--primary)" : error ? "#C62828" : "var(--border)"}`,
              borderRadius: 16,
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "rgba(123,31,69,0.04)" : "var(--cream-dark)",
              transition: "all 0.2s",
              marginBottom: 24,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileInput}
              style={{ display: "none" }}
            />
            <i
              className={`fa-solid ${preview ? "fa-file-circle-check" : "fa-cloud-arrow-up"}`}
              style={{ fontSize: 44, color: preview ? "var(--success)" : "var(--primary)", marginBottom: 14 }}
            />
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 6 }}>
              {preview ? preview.fileName : "Drop your backup file here"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {preview
                ? `${preview.fileSize} · Click to choose a different file`
                : "or click to browse · accepts .json files only"}
            </div>
          </div>

          {/* Parse Error */}
          {error && (
            <div style={{ padding: "12px 16px", background: "rgba(198,40,40,0.06)", border: "1px solid #C62828", borderRadius: 10, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
              <i className="fa-solid fa-circle-xmark" style={{ color: "#C62828" }} />
              <span style={{ fontSize: 13, color: "#C62828" }}>{error}</span>
            </div>
          )}

          {/* Preview Card */}
          {preview && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <h3 className="card-title" style={{ margin: 0 }}>
                  <i className="fa-solid fa-file-lines" style={{ marginRight: 8, color: "var(--primary)" }} />
                  Backup File Preview
                </h3>
              </div>
              <div className="card-body">
                {/* Meta Info */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 13, marginBottom: 20 }}>
                  <div><span style={{ color: "var(--text-muted)" }}>App:</span> <strong>{preview.meta.app || "—"}</strong></div>
                  <div><span style={{ color: "var(--text-muted)" }}>Version:</span> <strong>{preview.meta.version || "—"}</strong></div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Exported:</span>{" "}
                    <strong>{preview.meta.exported_at ? new Date(preview.meta.exported_at).toLocaleString("en-IN") : "—"}</strong>
                  </div>
                  <div><span style={{ color: "var(--text-muted)" }}>By:</span> <strong>{preview.meta.exported_by || "—"}</strong></div>
                </div>

                {/* Table Counts */}
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--primary)" }}>Records to Restore:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                  {Object.entries(preview.tableCounts).map(([table, count]) => (
                    <div key={table} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>{table}</span>
                      <strong style={{ color: count > 0 ? "var(--success)" : "var(--text-muted)" }}>{count}</strong>
                    </div>
                  ))}
                </div>

                {/* Confirmation */}
                <div style={{ marginTop: 24, padding: "16px 20px", background: "rgba(198,40,40,0.04)", border: "1px solid rgba(198,40,40,0.2)", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#C62828", marginBottom: 10 }}>
                    <i className="fa-solid fa-lock" style={{ marginRight: 8 }} />
                    Type <code style={{ background: "white", padding: "2px 8px", borderRadius: 4, fontWeight: 800, fontSize: 14 }}>RESTORE</code> to confirm
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder='Type "RESTORE" to enable the button'
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      style={{ maxWidth: 280 }}
                      autoComplete="off"
                    />
                    <button
                      className="btn btn-primary"
                      style={{
                        background: canRestore ? "#C62828" : "#ccc",
                        border: "none",
                        fontWeight: 700,
                        padding: "10px 28px",
                        cursor: canRestore ? "pointer" : "not-allowed",
                      }}
                      disabled={!canRestore}
                      onClick={executeRestore}
                    >
                      <i className="fa-solid fa-database" style={{ marginRight: 8 }} />
                      Restore Database
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
