"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";

type FileStatus = "pending" | "uploading" | "success" | "failed" | "skipped";

type ExtractedFile = {
  name: string;
  dressName: string;
  blob: Blob;
  status: FileStatus;
  message: string;
  matchedItem?: string;
  sku?: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function isSystemFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("__macosx") ||
    lower.includes(".ds_store") ||
    lower.includes("thumbs.db") ||
    lower.startsWith(".")
  );
}

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function stripExtension(filename: string): string {
  const basename = filename.split("/").pop() || filename;
  const i = basename.lastIndexOf(".");
  return i > 0 ? basename.slice(0, i) : basename;
}

const STATUS_CONFIG: Record<FileStatus, { color: string; icon: string; label: string }> = {
  pending: { color: "var(--text-muted)", icon: "fa-clock", label: "Pending" },
  uploading: { color: "#1565c0", icon: "fa-spinner fa-spin", label: "Uploading…" },
  success: { color: "var(--success, #2e7d32)", icon: "fa-circle-check", label: "Matched" },
  failed: { color: "var(--danger, #c62828)", icon: "fa-circle-xmark", label: "No Match" },
  skipped: { color: "#78909c", icon: "fa-forward", label: "Skipped" },
};

export default function ImageSyncClient() {
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [zipName, setZipName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const extractZip = useCallback(async (zipFile: File) => {
    setExtracting(true);
    setZipName(zipFile.name);
    setFiles([]);
    abortRef.current = false;

    try {
      const zip = await JSZip.loadAsync(zipFile);
      const extracted: ExtractedFile[] = [];

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (isSystemFile(path)) continue;
        if (!IMAGE_EXTS.has(getExt(path))) continue;

        const blob = await entry.async("blob");
        extracted.push({
          name: path.split("/").pop() || path,
          dressName: stripExtension(path),
          blob,
          status: "pending",
          message: "",
        });
      }

      extracted.sort((a, b) => a.dressName.localeCompare(b.dressName));
      setFiles(extracted);
    } catch (err) {
      setFiles([]);
      alert("Failed to read ZIP file. Make sure it's a valid .zip archive.");
    } finally {
      setExtracting(false);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".zip") || file.type === "application/zip")) {
      extractZip(file);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) extractZip(file);
    e.target.value = "";
  }

  function updateFile(index: number, patch: Partial<ExtractedFile>) {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function startUpload() {
    setProcessing(true);
    abortRef.current = false;

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;
      if (files[i].status === "success") continue;

      updateFile(i, { status: "uploading", message: "" });

      try {
        const form = new FormData();
        const ext = getExt(files[i].name) || "jpg";
        form.append("file", files[i].blob, `${files[i].dressName}.${ext}`);
        form.append("name", files[i].dressName);

        const res = await fetch("/api/admin/image-sync", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        const data = await res.json();

        if (res.ok && data.matched) {
          updateFile(i, {
            status: "success",
            message: `${data.itemName} (${data.sku})`,
            matchedItem: data.itemName,
            sku: data.sku,
          });
        } else {
          updateFile(i, {
            status: "failed",
            message: data.error || "No match found",
          });
        }
      } catch {
        updateFile(i, { status: "failed", message: "Network error" });
      }
    }

    setProcessing(false);
  }

  function stopUpload() {
    abortRef.current = true;
  }

  function clearAll() {
    setFiles([]);
    setZipName("");
    abortRef.current = false;
  }

  const counts = {
    total: files.length,
    success: files.filter((f) => f.status === "success").length,
    failed: files.filter((f) => f.status === "failed").length,
    pending: files.filter((f) => f.status === "pending" || f.status === "uploading").length,
  };

  const progressPct = counts.total
    ? Math.round(((counts.success + counts.failed) / counts.total) * 100)
    : 0;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-images" style={{ marginRight: 8 }} />
            Bulk Image Auto-Matcher
          </h3>
        </div>
        <div className="card-body">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>
            Upload a <strong>.zip</strong> file containing inventory photos. Each image filename should match the dress name in your inventory
            (e.g., <code>GOLDEN BRIDAL.jpg</code>). Photos are auto-matched and uploaded.
          </p>

          {files.length === 0 && !extracting && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--primary, #7b1f45)" : "var(--border, #ccc)"}`,
                borderRadius: 16,
                padding: "48px 24px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "rgba(123,31,69,0.04)" : "transparent",
                transition: "all .2s ease",
              }}
            >
              <i className="fa-solid fa-file-zipper" style={{ fontSize: 48, color: "var(--primary, #7b1f45)", marginBottom: 12, display: "block" }} />
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                Drop your ZIP file here
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                or click to browse &middot; accepts .zip files only
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
            </div>
          )}

          {extracting && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 28, marginBottom: 12, display: "block" }} />
              Extracting images from <strong>{zipName}</strong>…
            </div>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              <i className="fa-solid fa-list-check" style={{ marginRight: 8 }} />
              {zipName} &middot; {counts.total} images
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              {!processing && counts.pending > 0 && (
                <button className="btn btn-primary btn-sm" onClick={startUpload}>
                  <i className="fa-solid fa-play" style={{ marginRight: 6 }} />
                  Start Upload
                </button>
              )}
              {processing && (
                <button className="btn btn-outline btn-sm" onClick={stopUpload} style={{ color: "var(--danger)" }}>
                  <i className="fa-solid fa-stop" style={{ marginRight: 6 }} />
                  Stop
                </button>
              )}
              {!processing && (
                <button className="btn btn-outline btn-sm" onClick={clearAll}>
                  <i className="fa-solid fa-xmark" style={{ marginRight: 6 }} />
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {/* Progress bar */}
            {(processing || counts.success + counts.failed > 0) && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  <span>{progressPct}% complete</span>
                  <span>
                    <span style={{ color: "var(--success)" }}>{counts.success} matched</span>
                    {" · "}
                    <span style={{ color: "var(--danger)" }}>{counts.failed} failed</span>
                    {" · "}
                    <span style={{ color: "var(--text-muted)" }}>{counts.pending} remaining</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "#eee", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPct}%`,
                      background: counts.failed > 0 ? "linear-gradient(90deg, var(--success) 0%, var(--danger) 100%)" : "var(--success)",
                      borderRadius: 4,
                      transition: "width .3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* File list */}
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {files.map((f, i) => {
                const cfg = STATUS_CONFIG[f.status];
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                      background: f.status === "success" ? "rgba(46,125,50,0.03)" : f.status === "failed" ? "rgba(198,40,40,0.03)" : undefined,
                    }}
                  >
                    <i className={`fa-solid ${cfg.icon}`} style={{ color: cfg.color, width: 16, textAlign: "center", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.dressName}
                      </div>
                      {f.message && (
                        <div style={{ fontSize: 11, color: f.status === "success" ? "var(--success)" : "var(--text-muted)", marginTop: 2 }}>
                          {f.message}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: cfg.color,
                        textTransform: "uppercase",
                        flexShrink: 0,
                        letterSpacing: 0.5,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!processing && counts.success > 0 && counts.pending === 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ textAlign: "center", padding: 24 }}>
            <i className="fa-solid fa-circle-check" style={{ fontSize: 36, color: "var(--success)", marginBottom: 8, display: "block" }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Sync Complete
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              {counts.success} image{counts.success !== 1 ? "s" : ""} matched and uploaded
              {counts.failed > 0 && (
                <span> &middot; {counts.failed} failed to match</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
