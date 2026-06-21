"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import CategorySelect from "./CategorySelect";
import { photoUrl } from "@/lib/photoUrl";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { INVENTORY_EVENTS } from "@/lib/realtime/types";

type SearchItem = {
  id: number;
  name: string;
  display_name?: string;
  sku?: string;
  category?: string;
  size?: string;
  color?: string;
  status?: string;
  photo?: string;
  sub_category?: string;
  daily_rate?: number;
  deposit?: number;
  similarity?: number;
};

type SearchResponse = {
  category_results: SearchItem[];
  other_results: SearchItem[];
  used_fallback: boolean;
  category: string;
};

function statusColor(status: string) {
  if (status === "available") return "#68d391";
  if (status === "rented") return "#90cdf4";
  return "#fbd38d";
}

function SectionHeader({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <div
      style={{
        padding: "8px 14px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        background: bg,
        color,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {label}
    </div>
  );
}

function DressPhoto({ photo, size = 72 }: { photo?: string; size?: number }) {
  const thumb = photoUrl(photo);
  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          borderRadius: 10,
          border: "1px solid var(--border)",
          flexShrink: 0,
          background: "#fafafa",
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: size * 0.35,
      }}
    >
      👔
    </span>
  );
}

function TextResultRow({ item }: { item: SearchItem }) {
  const label = item.display_name || item.name;
  const sColor = statusColor(item.status || "");

  return (
    <Link
      href={`/inventory/${item.id}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
        color: "inherit",
      }}
      className="dress-search-result-link"
    >
      <DressPhoto photo={item.photo} size={80} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>{item.category}</strong>
            {item.size ? ` · Size ${item.size}` : ""}
            {item.color ? ` · ${item.color}` : ""}
          </div>
          {item.sku && <div>SKU: {item.sku}</div>}
          {(item.daily_rate != null || item.deposit != null) && (
            <div>
              {item.daily_rate != null && <>Rate: ₹{item.daily_rate.toLocaleString("en-IN")}</>}
              {item.daily_rate != null && item.deposit != null && " · "}
              {item.deposit != null && <>Deposit: ₹{item.deposit.toLocaleString("en-IN")}</>}
            </div>
          )}
        </div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: sColor,
          padding: "4px 10px",
          borderRadius: 10,
          background: `${sColor}22`,
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        {item.status}
      </span>
      <i
        className="fa-solid fa-arrow-right"
        style={{ color: "var(--text-muted)", fontSize: 12, flexShrink: 0, alignSelf: "center" }}
      />
    </Link>
  );
}

function PhotoResultRow({ item }: { item: SearchItem }) {
  const label = item.display_name || item.name;
  const simPct = item.similarity ?? 0;
  const simColor = simPct >= 80 ? "#68d391" : simPct >= 60 ? "#fbd38d" : "#fc8181";
  const sColor = statusColor(item.status || "");

  return (
    <Link
      href={`/inventory/${item.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
        color: "inherit",
      }}
      className="dress-search-result-link"
    >
      <DressPhoto photo={item.photo} size={64} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          {item.category}
          {item.sku ? ` · ${item.sku}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "center", minWidth: 54, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: simColor }}>{simPct}%</span>
        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>match</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: sColor,
          padding: "2px 10px",
          borderRadius: 10,
          background: `${sColor}22`,
          flexShrink: 0,
        }}
      >
        {item.status}
      </span>
    </Link>
  );
}

function ResultsList({
  catResults,
  otherResults,
  usedFallback,
  category,
  renderRow,
}: {
  catResults: SearchItem[];
  otherResults: SearchItem[];
  usedFallback: boolean;
  category: string;
  renderRow: (item: SearchItem) => ReactNode;
}) {
  if (!catResults.length && !otherResults.length) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
      {category && catResults.length > 0 && (
        <>
          <SectionHeader label={`In ${category} (${catResults.length})`} bg="var(--primary)11" color="var(--primary)" />
          {catResults.map((item) => (
            <div key={item.id}>{renderRow(item)}</div>
          ))}
        </>
      )}
      {!category && catResults.map((item) => (
        <div key={item.id}>{renderRow(item)}</div>
      ))}
      {usedFallback && otherResults.length > 0 && (
        <>
          <SectionHeader
            label={`From Other Categories (${otherResults.length})`}
            bg="#7b4a0033"
            color="#fbd38d"
          />
          {otherResults.map((item) => (
            <div key={item.id}>{renderRow(item)}</div>
          ))}
        </>
      )}
    </div>
  );
}

export default function InventorySearchClient() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [textData, setTextData] = useState<SearchResponse | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [photoData, setPhotoData] = useState<SearchResponse | null>(null);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runTextSearch = useCallback(async (query: string, cat: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setTextData(null);
      setTextLoading(false);
      return;
    }
    setTextLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/search?q=${encodeURIComponent(trimmed)}&category=${encodeURIComponent(cat)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) {
        setTextData({ category_results: [], other_results: [], used_fallback: false, category: cat });
        return;
      }
      const data = (await res.json()) as SearchResponse;
      setTextData({
        category_results: data.category_results || [],
        other_results: data.other_results || [],
        used_fallback: !!data.used_fallback,
        category: data.category || cat,
      });
    } catch {
      setTextData({ category_results: [], other_results: [], used_fallback: false, category: cat });
    } finally {
      setTextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (textTimerRef.current) clearTimeout(textTimerRef.current);
    if (!q.trim()) {
      setTextData(null);
      return;
    }
    textTimerRef.current = setTimeout(() => void runTextSearch(q, category), 280);
    return () => {
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    };
  }, [q, category, runTextSearch]);

  useRealtimeRefresh(INVENTORY_EVENTS, () => {
    if (q.trim()) void runTextSearch(q, category);
  });

  async function photoSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setPhotoLoading(true);
    setPhotoStatus("Searching...");
    setPhotoData(null);

    const form = new FormData();
    form.append("photo", file);
    if (category) form.append("category", category);

    try {
      const res = await fetch("/api/inventory/photo-search", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setPhotoStatus(`Error: ${data.error}`);
        return;
      }
      const catResults: SearchItem[] = data.category_results || [];
      const otherResults: SearchItem[] = data.other_results || [];
      setPhotoData({
        category_results: catResults,
        other_results: otherResults,
        used_fallback: !!data.used_fallback,
        category: data.category || category,
      });
      if (!catResults.length && !otherResults.length) {
        setPhotoStatus(
          category
            ? `No visual match in ${category} or other categories`
            : "No visually similar dresses found",
        );
      } else if (data.used_fallback) {
        setPhotoStatus(`No match in ${data.category} — showing ${otherResults.length} from other categories`);
      } else {
        const total = catResults.length + otherResults.length;
        setPhotoStatus(
          `${total} visual match${total > 1 ? "es" : ""} found${data.category ? ` in ${data.category}` : ""}`,
        );
      }
    } catch {
      setPhotoStatus("Search failed. Please try again.");
    } finally {
      setPhotoLoading(false);
    }
  }

  const textHasResults =
    !!textData && (textData.category_results.length > 0 || textData.other_results.length > 0);
  const photoHasResults =
    !!photoData && (photoData.category_results.length > 0 || photoData.other_results.length > 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fa-solid fa-tags" style={{ color: "var(--gold)", fontSize: 18 }} />
              <label style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>Search Category</label>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <CategorySelect value={category} onChange={setCategory} />
            </div>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {category
                ? (
                  <>
                    Searching in <strong style={{ color: "var(--primary)" }}>{category}</strong> first — other categories shown only if no match.
                  </>
                )
                : "All categories — no filter applied."}
            </span>
          </div>
        </div>
      </div>

      <div className="dress-search-layout dress-search-grid">
        <div className="card" style={{ overflow: "visible" }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-keyboard" style={{ marginRight: 8, color: "var(--gold)" }} />
              Search by Name
            </h3>
          </div>
          <div className="card-body" style={{ overflow: "visible" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              Type a dress name or SKU. Words can be in <strong>any order</strong>. Suggestions appear as you type.
            </p>
            <div style={{ position: "relative", marginBottom: 12, overflow: "visible", zIndex: 20 }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{
                  position: "absolute",
                  left: 13,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  zIndex: 1,
                  pointerEvents: "none",
                }}
              />
              <DressNameSuggestInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onSuggestSelect={(item) => {
                  setQ(item.name);
                  void runTextSearch(item.name, category);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runTextSearch(q, category);
                }}
                category={category}
                showPhotos
                placeholder="e.g. golden ct, Sherwani, Lehenga…"
                style={{ paddingLeft: 40, fontSize: 15, height: 48 }}
                autoFocus
              />
            </div>

            {textLoading && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Searching…</p>
            )}

            {textHasResults && textData && (
              <ResultsList
                catResults={textData.category_results}
                otherResults={textData.other_results}
                usedFallback={textData.used_fallback}
                category={textData.category}
                renderRow={(item) => <TextResultRow item={item} />}
              />
            )}

            {q.trim() && !textLoading && textData && !textHasResults && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                <i className="fa-solid fa-circle-info" style={{ fontSize: 32, marginBottom: 10, display: "block", opacity: 0.4 }} />
                {category
                  ? <>No matches in <strong>{category}</strong> or other categories</>
                  : "No matching dresses found"}
              </div>
            )}

            {!q.trim() && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 36, marginBottom: 12, display: "block", opacity: 0.25 }} />
                Start typing to search…
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-camera" style={{ marginRight: 8, color: "var(--gold)" }} />
              Search by Photo
            </h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              Upload a photo to find visually similar dresses in your inventory.
            </p>
            <label className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 14 }}>
              <i className="fa-solid fa-upload" />
              Upload Photo
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={photoSearch} />
            </label>

            {photoPreview && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 12,
                  background: "var(--bg)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  marginBottom: 14,
                }}
              >
                <img
                  src={photoPreview}
                  alt="Query"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{photoLoading ? "Searching…" : photoStatus}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Visual similarity matching</div>
                </div>
              </div>
            )}

            {photoHasResults && photoData && (
              <ResultsList
                catResults={photoData.category_results}
                otherResults={photoData.other_results}
                usedFallback={photoData.used_fallback}
                category={photoData.category}
                renderRow={(item) => <PhotoResultRow item={item} />}
              />
            )}

            {!photoPreview && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                <i className="fa-solid fa-camera" style={{ fontSize: 36, marginBottom: 12, display: "block", opacity: 0.25 }} />
                Upload a photo to search
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
