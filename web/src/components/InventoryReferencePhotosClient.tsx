"use client";

import { useCallback, useEffect, useState } from "react";
import ZoomableImage from "@/components/ZoomableImage";

type RefPhoto = {
  id: number;
  label: string | null;
  url: string;
  indexedAt: string | null;
};

const LABEL_OPTIONS = [
  { value: "front", label: "Front view" },
  { value: "back", label: "Back view" },
  { value: "side", label: "Side view" },
  { value: "hanger", label: "On hanger" },
  { value: "mannequin", label: "On mannequin" },
  { value: "folded", label: "Folded / packed" },
  { value: "customer", label: "Customer wearing" },
  { value: "photoshoot", label: "Photoshoot / studio" },
  { value: "indoor", label: "Indoor photo" },
  { value: "outdoor", label: "Outdoor photo" },
  { value: "detail", label: "Detail / embroidery" },
];

export default function InventoryReferencePhotosClient({
  itemId,
  canEdit,
}: {
  itemId: number;
  canEdit: boolean;
}) {
  const [photos, setPhotos] = useState<RefPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("front");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/${itemId}/reference-photos`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setPhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;

    setUploading(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("label", label);
      const res = await fetch(`/api/inventory/${itemId}/reference-photos`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage("Angle photo saved — AI re-index started for better dress search.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(refId: number) {
    if (!confirm("Remove this angle photo? Dress search will re-index.")) return;
    setError("");
    try {
      const res = await fetch(`/api/inventory/${itemId}/reference-photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ margin: 0 }}>
          <i className="fa-solid fa-camera-rotate" style={{ marginRight: 8 }} />
          Dress Search — Angle Photos
        </h3>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Add photos from other angles and settings (hanger, mannequin, back, outdoor, photoshoot).
          The dress indexer saves fingerprints for every view so Dress Search can match customer
          photos from any angle.
        </p>

        {canEdit && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="form-control"
              style={{ maxWidth: 220 }}
              disabled={uploading}
            >
              {LABEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="btn btn-outline btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
              <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
              {uploading ? "Uploading…" : "Add angle photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void onUpload(e)}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>
        )}

        {message && (
          <div style={{ fontSize: 13, color: "var(--success, #2e7d32)" }}>{message}</div>
        )}
        {error && (
          <div style={{ fontSize: 13, color: "var(--danger, #c62828)" }}>{error}</div>
        )}

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading angle photos…</div>
        ) : photos.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No extra angle photos yet — only the main catalog photo is indexed.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 12,
            }}
          >
            {photos.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <ZoomableImage
                  src={p.url}
                  alt={p.label || "Angle"}
                  overlayCaption={p.label || "Angle"}
                  style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover" }}
                />
                <div style={{ padding: "6px 8px", fontSize: 11 }}>
                  <div style={{ fontWeight: 700, textTransform: "capitalize" }}>
                    {p.label || "angle"}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void onDelete(p.id)}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "none",
                        color: "var(--danger, #c62828)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 11,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
