"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import type { MarketingStyle } from "@/lib/ai/enhancementPrompts";

const CATEGORIES = [
  "── Women's Wear ──",
  "Bridal Lehenga", "Non Bridal Lehenga", "Designer Lehenga",
  "Crop Top", "Gown", "Anarkali", "Sharara", "Garara",
  "Saree", "Half Saree", "Indo Western",
  "── Men's Wear ──",
  "Sherwani", "Coat Suit", "Jodhpuri Suit", "Tuxedo",
  "Bandhgala", "Kurta Pajama", "Waistcoat", "Blazer",
  "── Jewellery ──",
  "Bridal Jewellery", "Non Bridal Jewellery", "Necklace",
  "Choker", "Maang Tikka", "Earrings", "Nath", "Kaleere",
  "Bangles", "Bracelets", "Rings",
  "── Accessories ──",
  "Pagdi", "Safa", "Mojari", "Dupatta", "Accessories",
];

const STYLES: { value: MarketingStyle; label: string; desc: string }[] = [
  {
    value: "luxury_catalog",
    label: "Luxury Catalog",
    desc: "Designer brand catalog — premium backdrop, editorial lighting",
  },
  {
    value: "lifestyle",
    label: "Lifestyle",
    desc: "Aspirational setting — wedding venue or elegant boutique interior",
  },
  {
    value: "campaign",
    label: "Fashion Campaign",
    desc: "Bold campaign image — dramatic lighting, hero shot",
  },
  {
    value: "minimal",
    label: "Minimal",
    desc: "Pure white background, soft light, clean editorial",
  },
  {
    value: "wedding",
    label: "Bridal Wedding",
    desc: "Warm golden bridal studio — luxury bridal catalog quality",
  },
];

type GenResult = {
  enhancedBase64: string;
  mimeType: string;
  latencyMs: number;
  model: string;
  savedPath: string | null;
};

export default function CatalogGeneratorClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [category, setCategory] = useState("Bridal Lehenga");
  const [style, setStyle] = useState<MarketingStyle>("luxury_catalog");
  const [itemId, setItemId] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [drag, setDrag] = useState(false);

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setResult(null);
    setSaveMsg("");
    setStatus("");
  }

  async function generate() {
    if (!file) return;
    setLoading(true);
    setStatus("");
    setResult(null);
    setSaveMsg("");
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("category", category);
      form.append("style", style);
      if (itemId.trim()) form.append("itemId", itemId.trim());

      const data = await fetchJson<GenResult>("/api/ai-tools/catalog-generator", {
        method: "POST",
        body: form,
      });
      setResult(data);
      const saved = data.savedPath ? ` · Saved to inventory item.` : "";
      setStatus(`Generated in ${(data.latencyMs / 1000).toFixed(1)}s · ${data.model}${saved}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveToItem() {
    if (!result || !itemId) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const resp = await fetchJson<{ ok: boolean; savedPath: string }>(
        "/api/ai-tools/catalog-generator/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: parseInt(itemId, 10),
            base64: result.enhancedBase64,
          }),
        },
      );
      setSaveMsg(`Saved as marketingPhoto for item ${itemId}: ${resp.savedPath}`);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:${result.mimeType};base64,${result.enhancedBase64}`;
    a.download = `catalog-${category.replace(/\s+/g, "-").toLowerCase()}-${style}-${Date.now()}.jpg`;
    a.click();
  }

  const marketingUrl = result
    ? `data:${result.mimeType};base64,${result.enhancedBase64}`
    : null;

  const isError = status.toLowerCase().includes("fail") || status.toLowerCase().includes("error");

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div
        className="card"
        style={{ padding: "20px 24px", borderLeft: "4px solid #7c3aed" }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>
          AI Catalog Generator — Pipeline 3
        </h2>
        <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
          Create luxury marketing images for campaigns, catalogs, and social media.
          This pipeline uses creative AI — images are stored as{" "}
          <code>marketingPhoto</code> and are <strong>never</strong> shown in
          customer-facing inventory or booking flows.
        </p>
        <div
          style={{
            marginTop: 10,
            padding: "8px 14px",
            background: "#fdf4ff",
            borderRadius: 6,
            fontSize: 12,
            color: "#7c3aed",
            fontWeight: 500,
          }}
        >
          Pipeline 2 (auto-enhancement) runs separately and preserves every garment detail
          exactly. This page is for marketing creativity only.
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 20 }}>
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${drag ? "#7c3aed" : "#ccc"}`,
            borderRadius: 10,
            padding: "28px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: drag ? "#fdf4ff" : "#fafafa",
            marginBottom: 16,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span style={{ fontWeight: 500 }}>
              {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </span>
          ) : (
            <span style={{ color: "#888" }}>Click or drag an inventory photo here</span>
          )}
        </div>

        {/* Category + Style */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label>
            <span style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
              Category
            </span>
            <select
              className="input"
              style={{ width: "100%" }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c, i) =>
                c.startsWith("──") ? (
                  <option key={i} disabled value="">
                    {c}
                  </option>
                ) : (
                  <option key={i} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            <span style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
              Marketing Style
            </span>
            <select
              className="input"
              style={{ width: "100%" }}
              value={style}
              onChange={(e) => setStyle(e.target.value as MarketingStyle)}
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.desc}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Optional Item ID */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
          <label style={{ flex: 1 }}>
            <span style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Save to Inventory Item (optional)
            </span>
            <input
              className="input"
              type="number"
              placeholder="Item ID (leave blank to skip saving)"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <button
          className="btn"
          style={{
            background: "#7c3aed",
            color: "#fff",
            padding: "10px 32px",
            fontWeight: 600,
            borderRadius: 8,
          }}
          onClick={generate}
          disabled={!file || loading}
        >
          {loading ? "Generating Marketing Image…" : "Generate Catalog Image"}
        </button>

        {status && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: isError ? "#fff1f0" : "#f5f3ff",
              color: isError ? "#c00" : "#7c3aed",
              fontSize: 13,
            }}
          >
            {status}
          </div>
        )}
      </div>

      {/* Before / After */}
      {originalUrl && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Original → Marketing Image</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div
                style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#888" }}
              >
                Original Inventory Photo
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl}
                alt="Original"
                style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e5e5" }}
              />
            </div>
            <div>
              <div
                style={{
                  marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: 1, color: marketingUrl ? "#7c3aed" : "#ccc",
                }}
              >
                {marketingUrl ? "Marketing Image Generated" : "Marketing Image (pending)"}
              </div>
              {marketingUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={marketingUrl}
                  alt="Marketing"
                  style={{
                    width: "100%", borderRadius: 8,
                    border: "2px solid #7c3aed",
                    boxShadow: "0 4px 24px rgba(124,58,237,0.18)",
                  }}
                />
              ) : loading ? (
                <div
                  style={{
                    aspectRatio: "3/4", borderRadius: 8, border: "2px dashed #ddd",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#fdf4ff", color: "#999", fontSize: 14,
                  }}
                >
                  Generating with OpenAI…
                </div>
              ) : (
                <div
                  style={{
                    aspectRatio: "3/4", borderRadius: 8, border: "2px dashed #ddd",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#fafafa", color: "#ccc", fontSize: 14,
                  }}
                >
                  Click Generate to preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {result && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>Actions</h3>
          <div style={{ display: "grid", gap: 14 }}>
            <button
              className="btn"
              style={{ width: "fit-content", padding: "8px 20px" }}
              onClick={download}
            >
              Download Marketing Image
            </button>
            <div style={{ borderTop: "1px solid #eee", paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Save as <code>marketingPhoto</code> for Inventory Item
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className="input"
                  type="number"
                  placeholder="Inventory Item ID"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  style={{ width: 180 }}
                />
                <button
                  className="btn"
                  style={{ background: "#7c3aed", color: "#fff", padding: "8px 20px" }}
                  onClick={saveToItem}
                  disabled={!itemId || saving}
                >
                  {saving ? "Saving…" : "Save Marketing Photo"}
                </button>
              </div>
              {saveMsg && (
                <div
                  style={{
                    marginTop: 8, fontSize: 13,
                    color: saveMsg.startsWith("Saved") ? "#7c3aed" : "#c00",
                  }}
                >
                  {saveMsg}
                </div>
              )}
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888" }}>
                Saved as <code>marketingPhoto</code> only. Never shown in inventory list,
                booking, or customer documents. Original and enhanced photos are unaffected.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
