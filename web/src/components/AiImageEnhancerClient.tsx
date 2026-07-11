"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type EnhanceResult = {
  enhancedBase64: string;
  mimeType: string;
  latencyMs: number;
  model: string;
  styleLabel: string;
};

export default function AiImageEnhancerClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saveItemId, setSaveItemId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);

  function onFileChange(f: File | null) {
    if (!f) return;
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setResult(null);
    setSaveMessage("");
    setMessage("");
  }

  async function runEnhance() {
    if (!file) return;
    setLoading(true);
    setMessage("");
    setResult(null);
    setSaveMessage("");
    try {
      const form = new FormData();
      form.append("image", file);
      const data = await fetchJson<EnhanceResult>("/api/ai-tools/image-enhancer/preview", {
        method: "POST",
        body: form,
      });
      setResult(data);
      setMessage(`Done in ${(data.latencyMs / 1000).toFixed(1)}s · ${data.model}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Enhancement failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveToInventory() {
    if (!result || !saveItemId) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const resp = await fetchJson<{ ok: boolean; enhancedPhoto: string }>(
        "/api/ai-tools/image-enhancer/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: parseInt(saveItemId, 10),
            enhancedBase64: result.enhancedBase64,
            mimeType: result.mimeType,
          }),
        },
      );
      setSaveMessage(`Saved as enhancedPhoto for item ${saveItemId}: ${resp.enhancedPhoto}`);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function downloadEnhanced() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:${result.mimeType};base64,${result.enhancedBase64}`;
    a.download = `enhanced-${Date.now()}.jpg`;
    a.click();
  }

  const enhancedUrl = result ? `data:${result.mimeType};base64,${result.enhancedBase64}` : null;
  const isError = message.toLowerCase().includes("fail") || message.toLowerCase().includes("error");

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--accent, #8b6914)" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>AI Enhancer — Pipeline 2</h2>
        <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
          Removes the shop background and replaces it with a clean studio backdrop.
          The garment itself is <strong>never touched</strong> — same position, same embroidery, same colors.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <div style={{ padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, color: "#166534" }}>
            <strong>✓ What this does:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              <li>Removes shop racks, hangers, other clothing</li>
              <li>Replaces with warm ivory studio backdrop</li>
              <li>Improves lighting and color accuracy</li>
              <li>Sharpens existing embroidery details</li>
            </ul>
          </div>
          <div style={{ padding: "10px 14px", background: "#fff7ed", borderRadius: 8, fontSize: 12, color: "#9a3412" }}>
            <strong>✗ What this does NOT do:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              <li>Does NOT place garment on mannequin</li>
              <li>Does NOT move or reposition garment</li>
              <li>Does NOT redesign or add new embroidery</li>
              <li>Does NOT change colors or silhouette</li>
            </ul>
          </div>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#888" }}>
          Need mannequin placement or creative catalog images?{" "}
          <a href="/ai-tools/catalog-generator" style={{ color: "#7c3aed" }}>
            Use the AI Catalog Generator (Pipeline 3) →
          </a>
        </p>
      </div>

      {/* Upload + Action */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "grid", gap: 14 }}>
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files[0];
              if (f) onFileChange(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? "var(--accent, #8b6914)" : "#ccc"}`,
              borderRadius: 10,
              padding: "28px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragActive ? "rgba(139,105,20,0.04)" : "#fafafa",
              transition: "all 0.2s",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span style={{ color: "#333", fontWeight: 500 }}>
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            ) : (
              <span style={{ color: "#888" }}>Click or drag an inventory photo here</span>
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{ height: 42, padding: "0 32px", fontWeight: 600, fontSize: 15 }}
            onClick={runEnhance}
            disabled={!file || loading}
          >
            {loading ? "Removing background…" : "Remove Background & Enhance"}
          </button>

          {message && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: isError ? "#fff1f0" : "#f0fdf4",
                color: isError ? "#c00" : "#1a7a3c",
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Before / After comparison */}
      {originalUrl && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Before / After</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Original */}
            <div>
              <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888" }}>
                Original (shop photo)
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl}
                alt="Original"
                style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e5e5", display: "block" }}
              />
            </div>

            {/* Enhanced */}
            <div>
              <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: enhancedUrl ? "var(--accent, #8b6914)" : "#ccc" }}>
                {enhancedUrl ? "Enhanced (studio background)" : "Enhanced (pending)"}
              </div>
              {enhancedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={enhancedUrl}
                  alt="Enhanced"
                  style={{
                    width: "100%", borderRadius: 8, display: "block",
                    border: "2px solid var(--accent, #8b6914)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                  }}
                />
              ) : loading ? (
                <div style={{
                  aspectRatio: "2/3", borderRadius: 8, border: "2px dashed #ddd",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#fafafa", color: "#999", fontSize: 13, flexDirection: "column", gap: 8,
                }}>
                  <div>Removing background with OpenAI…</div>
                  <div style={{ fontSize: 11, color: "#bbb" }}>This takes 30–90 seconds</div>
                </div>
              ) : (
                <div style={{
                  aspectRatio: "2/3", borderRadius: 8, border: "2px dashed #ddd",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#fafafa", color: "#ccc", fontSize: 13,
                }}>
                  Click "Remove Background" to preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {result && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>Save Enhanced Image</h3>
          <div style={{ display: "grid", gap: 14 }}>
            <button
              className="btn"
              style={{ width: "fit-content", padding: "8px 20px" }}
              onClick={downloadEnhanced}
            >
              Download Enhanced Image
            </button>

            <div style={{ borderTop: "1px solid #eee", paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Save as <code>enhancedPhoto</code> for Inventory Item
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="input"
                  style={{ width: 180 }}
                  type="number"
                  placeholder="Inventory Item ID"
                  value={saveItemId}
                  onChange={(e) => setSaveItemId(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={saveToInventory}
                  disabled={!saveItemId || saving}
                  style={{ padding: "8px 20px" }}
                >
                  {saving ? "Saving…" : "Save to Inventory"}
                </button>
              </div>
              {saveMessage && (
                <div style={{ marginTop: 8, fontSize: 13, color: saveMessage.startsWith("Saved") ? "#1a7a3c" : "#c00" }}>
                  {saveMessage}
                </div>
              )}
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888" }}>
                Saves as <code>enhancedPhoto</code>. Original photo is never overwritten.
                All customer-facing pages (booking slips, catalogs, search) will show the enhanced version.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
