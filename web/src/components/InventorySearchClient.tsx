"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import CategorySelect from "./CategorySelect";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import { photoUrl } from "@/lib/photoUrl";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { INVENTORY_EVENTS } from "@/lib/realtime/types";
import { SIZES, SUB_CATEGORIES } from "@/lib/constants";
import type { DressCheckerSearchMeta } from "@/lib/dressCheckerTypes";
import { remediationForIssueCode } from "@/lib/dressChecker/issueRemediation";
import { subcategoryOptionsForCategory } from "@/lib/dressChecker/categorySearchScope";

type Confidence = {
  stars: string;
  label: string;
  reliable: boolean;
  matchLabel: string;
};

type ComponentScores = {
  global: number;
  border: number;
  blouse: number;
  skirt: number;
  embroidery: number;
  texture: number;
  color: number;
  metadataColor: number;
  weighted: number;
};

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
  confidence?: Confidence;
  rank_reason?: string;
  ai_explanation?: string;
  expected_return_date?: string | null;
  next_available_date?: string | null;
  upcoming_booking_count?: number;
  vector_similarity?: number;
  component_scores?: ComponentScores;
  best_reference?: { refId: string; label: string; querySource: string };
  match_explanation?: {
    embroidery: number;
    border: number;
    texture: number;
    silhouette: number;
    motifs: number;
    colour: number;
    overall: number;
    summary: string;
  };
  identification_debug?: Array<{
    refId: string;
    refLabel: string;
    querySource: string;
    components: ComponentScores;
  }>;
};

type SearchResponse = {
  category_results: SearchItem[];
  other_results: SearchItem[];
  used_fallback: boolean;
  fallback_reason?: string | null;
  fallback_code?: string | null;
  search_degraded?: boolean;
  degradation?: {
    code: string;
    reason: string;
    from_engine: string;
    to_engine: string;
  } | null;
  category: string;
  detected_category?: string;
  search_mode?: "AUTO" | "MANUAL" | "ALL";
  search_scope_label?: string;
  detected_subcategory?: string;
  offer_search_entire_inventory?: boolean;
  category_filter_diagnostics?: {
    candidates_before_filtering: number;
    candidates_after_filtering: number;
    indexed_before_filtering: number;
    indexed_after_filtering: number;
  };
  sub_category?: string;
  search_engine?: "identification" | "hash" | "siglip" | "openai_pgvector_hybrid";
  screenshot_warning?: boolean;
  best_similarity?: number;
  reliable_identification?: boolean;
  identification_meta?: DressCheckerSearchMeta;
  image_warnings?: string[];
  pipeline_stages?: {
    stage_a_category: string;
    stage_b_candidates: number;
    stage_c_scored: number;
  };
  category_detection?: {
    category: string;
    confidence: number;
    scores: Record<string, number>;
  };
  dress_checker_debug?: {
    uploadedImage: { width: number; height: number; bytes: number };
    embeddingModel: string;
    embeddingDimension: number;
    embeddingGenerationMs: number;
    searchMs: number;
    inventoryImagesUsed: number;
    staleIndexCount: number;
    referenceImageSelected: string;
    detectedCategory?: string;
    detectedColour?: string;
    detectedEmbroidery?: string;
    detectedSleeve?: string;
    detectedNeckline?: string;
    pipelineStages?: Array<{ stage: string; durationMs: number }>;
    candidateFilterStages?: Array<{ stage: number; name: string; before: number; after: number }>;
    topMatches: Array<{
      rank: number;
      sku: string;
      name: string;
      finalScore: number;
      globalScore: number;
      borderScore: number;
      embroideryScore: number;
      textureScore: number;
      colorScore: number;
      bestRefLabel: string;
      rankReason: string;
      rejectedRules?: string[];
    }>;
    componentScores: Record<string, number> | null;
  };
  similar_available?: SearchItem[];
  ai_diagnostics?: Record<string, unknown>;
};

const PHOTO_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
const MAX_PHOTO_MB = 10;
const IS_DEV = process.env.NODE_ENV !== "production";

function statusColor(status: string) {
  if (status === "available") return "#68d391";
  if (status === "rented") return "#90cdf4";
  return "#fbd38d";
}

function simColor(pct: number) {
  if (pct >= 95) return "#68d391";
  if (pct >= 85) return "#9ae6b4";
  if (pct >= 75) return "#fbd38d";
  return "#fc8181";
}

function SearchDegradationBanner({
  code,
  reason,
  searchEngine,
}: {
  code: string;
  reason: string;
  searchEngine?: string;
}) {
  const remediation = remediationForIssueCode(code);

  return (
    <div
      role="alert"
      style={{
        padding: "12px 14px",
        marginBottom: 14,
        borderRadius: 10,
        border: "1px solid #c53030",
        background: "rgba(197,48,48,0.08)",
        borderLeft: "4px solid #c53030",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <i
          className="fa-solid fa-triangle-exclamation"
          style={{ color: "#c53030", marginTop: 2, flexShrink: 0 }}
        />
        <div style={{ flex: 1, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: "#9b2c2c" }}>
            Search degraded — hash fallback active
          </div>
          <div style={{ marginTop: 4, color: "#742a2a" }}>
            <code style={{ fontSize: 11 }}>{code}</code>
            <span style={{ marginLeft: 8 }}>{reason}</span>
          </div>
          {searchEngine && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#a0aec0" }}>
              Engine: {searchEngine}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: "#744210" }}>
            <strong>Fix:</strong> {remediation}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#a0aec0" }}>
            Vector search (pgvector) is required. Hash results are approximate and may miss matches.
          </div>
        </div>
      </div>
    </div>
  );
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
          {item.upcoming_booking_count != null && (
            <div>
              Upcoming bookings: {item.upcoming_booking_count}
              {item.expected_return_date ? ` · Return: ${new Date(item.expected_return_date).toLocaleDateString("en-GB")}` : ""}
              {item.next_available_date ? ` · Next available: ${new Date(item.next_available_date).toLocaleDateString("en-GB")}` : ""}
            </div>
          )}
          {item.ai_explanation ? <div>AI: {item.ai_explanation}</div> : null}
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

function PhotoResultRow({ item, debugMode }: { item: SearchItem; debugMode?: boolean }) {
  const label = item.display_name || item.name;
  const simPct = item.similarity ?? 0;
  const color = simColor(simPct);
  const sColor = statusColor(item.status || "");
  const conf = item.confidence;
  const matchText =
    conf?.matchLabel ||
    (simPct >= 95
      ? "Exact match"
      : simPct >= 85
        ? "Highly likely"
        : simPct >= 75
          ? "Possible match"
          : "Below threshold");
  const comps = item.component_scores;

  return (
    <Link
      href={`/inventory/${item.id}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
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
          {item.size ? ` · ${item.size}` : ""}
          {item.sku ? ` · ${item.sku}` : ""}
          {item.sub_category ? ` · ${item.sub_category}` : ""}
        </div>
        {item.match_explanation && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
            Embroidery {item.match_explanation.embroidery}% · Border {item.match_explanation.border}% · Texture{" "}
            {item.match_explanation.texture}% · Silhouette {item.match_explanation.silhouette}% · Motifs{" "}
            {item.match_explanation.motifs}%
          </div>
        )}
        {item.rank_reason && !item.match_explanation && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
            {item.rank_reason}
          </div>
        )}
        {debugMode && comps && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
            Embedding {comps.global}% · Embroidery {comps.embroidery}% · Border {comps.border}% · Motifs{" "}
            {(comps as { motifs?: number }).motifs ?? item.match_explanation?.motifs ?? "—"}% · Texture {comps.texture}%
            · Colour {comps.color}% · Shape {(comps as { silhouette?: number }).silhouette ?? item.match_explanation?.silhouette ?? "—"}%
            <br />
            Final weighted {comps.weighted}%
            {item.best_reference && (
              <>
                <br />
                Best ref: {item.best_reference.label} via {item.best_reference.querySource}
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", minWidth: 72, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color }}>{simPct}%</span>
        {conf?.stars && (
          <div style={{ fontSize: 11, color: "var(--gold, #d4a017)", letterSpacing: 1 }}>{conf.stars}</div>
        )}
        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{matchText}</div>
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
          marginTop: 4,
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

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 13,
  background: "var(--bg)",
};

export default function InventorySearchClient() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [searchMode, setSearchMode] = useState<"AUTO" | "MANUAL" | "ALL">("MANUAL");
  const [textData, setTextData] = useState<SearchResponse | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [photoData, setPhotoData] = useState<SearchResponse | null>(null);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoFileRef = useRef<File | null>(null);
  const [correctionRecordedId, setCorrectionRecordedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchEngine, setSearchEngine] = useState<string>("");
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [filterSize, setFilterSize] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDesigner, setFilterDesigner] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [debugMode, setDebugMode] = useState(false);

  const subCategoryOptions = subcategoryOptionsForCategory(category);

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

  const runPhotoSearch = useCallback(
    async (
      file: File,
      overrides?: { mode?: "AUTO" | "MANUAL" | "ALL"; category?: string; subCategory?: string },
    ) => {
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setPhotoStatus(`File too large — max ${MAX_PHOTO_MB}MB`);
        return;
      }

      setPhotoFile(file);
      photoFileRef.current = file;
      setCorrectionRecordedId(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setPhotoPreview(URL.createObjectURL(file));
      setPhotoLoading(true);
      setPhotoStatus("Running identification pipeline…");
      setPhotoData(null);
      setSearchEngine("");
      setScreenshotWarning(false);

      const effectiveMode = overrides?.mode ?? searchMode;
      const effectiveCategory = overrides?.category !== undefined ? overrides.category : category;
      const effectiveSub = overrides?.subCategory !== undefined ? overrides.subCategory : subCategory;

      const form = new FormData();
      form.append("photo", file);
      form.append("mode", effectiveMode);
      if (effectiveMode !== "ALL" && effectiveCategory) form.append("category", effectiveCategory);
      if (effectiveMode === "MANUAL" && effectiveSub) form.append("sub_category", effectiveSub);
      if (filterSize) form.append("size", filterSize);
      if (filterColor) form.append("color", filterColor);
      if (filterGender) form.append("gender", filterGender);
      if (filterStatus) form.append("status", filterStatus);
      if (filterDesigner) form.append("designer", filterDesigner);
      if (filterMinPrice) form.append("min_price", filterMinPrice);
      if (filterMaxPrice) form.append("max_price", filterMaxPrice);
      if (debugMode) form.append("debug", "1");

      try {
        const res = await fetch("/api/inventory/photo-search", { method: "POST", body: form, credentials: "same-origin" });
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
          fallback_reason: data.fallback_reason ?? null,
          fallback_code: data.fallback_code ?? null,
          search_degraded: !!data.search_degraded,
          degradation: data.degradation ?? null,
          category: data.category || category,
          sub_category: data.sub_category || subCategory,
          detected_category: data.detected_category,
          detected_subcategory: data.detected_subcategory,
          search_mode: data.search_mode,
          search_scope_label: data.search_scope_label,
          offer_search_entire_inventory: !!data.offer_search_entire_inventory,
          category_filter_diagnostics: data.category_filter_diagnostics,
          search_engine: data.search_engine,
          best_similarity: data.best_similarity,
          reliable_identification: data.reliable_identification,
          pipeline_stages: data.pipeline_stages,
          category_detection: data.category_detection,
          identification_meta: data.identification_meta,
          image_warnings: data.image_warnings,
          similar_available: data.similar_available || [],
          ai_diagnostics: data.ai_diagnostics,
        });
        setSearchEngine(
          data.search_degraded || data.search_engine === "hash"
            ? `DEGRADED: hash fallback (${data.fallback_code || "SEARCH_DEGRADED_HASH"})`
            : data.search_engine === "pgvector"
              ? "pgvector ANN"
              : data.search_engine === "openai_pgvector_hybrid"
                ? "OpenAI + pgvector hybrid"
                : "Multi-stage identification",
        );
        setScreenshotWarning(!!data.screenshot_warning);
        const meta = data.identification_meta;
        const scopeLabel = data.search_scope_label || "";
        if (data.search_degraded || (data.used_fallback && data.search_engine === "hash")) {
          setPhotoStatus(
            `Search degraded to hash fallback [${data.fallback_code || "SEARCH_DEGRADED_HASH"}]: ${data.fallback_reason || data.degradation?.reason || "pgvector unavailable"}`,
          );
        } else if (data.screenshot_warning) {
          setPhotoStatus(
            "This looks like a screenshot — upload the dress photo directly (camera or gallery) for best results.",
          );
        } else if (data.offer_search_entire_inventory && !catResults.length && !otherResults.length) {
          setPhotoStatus(meta?.message || "No matches in selected category.");
        } else if (meta?.ambiguous_match || meta?.decision === "review_required") {
          setPhotoStatus("Multiple possible matches found — please confirm the correct dress below.");
        } else if (
          meta?.decision === "unreliable" ||
          meta?.decision === "no_match" ||
          !data.reliable_identification
        ) {
          setPhotoStatus(meta?.message || "No reliable identification found. Please retake photo (full dress, better lighting).");
        } else if (!catResults.length && !otherResults.length) {
          setPhotoStatus(
            scopeLabel || (category ? `No visual match in ${category}` : "No visually similar dresses found"),
          );
        } else if (data.reliable_identification) {
          const top = catResults[0] || otherResults[0];
          setPhotoStatus(`Identified: ${top?.display_name || top?.name} (${data.best_similarity || top?.similarity || 0}%)`);
        } else if (data.used_fallback) {
          setPhotoStatus(`No match in ${data.category} — showing ${otherResults.length} from other categories`);
        } else {
          const total = catResults.length + otherResults.length;
          setPhotoStatus(`${total} top match${total > 1 ? "es" : ""}${data.category ? ` in ${data.category}` : ""}`);
        }
      } catch {
        setPhotoStatus("Search failed. Please try again.");
      } finally {
        setPhotoLoading(false);
      }
    },
    [category, subCategory, searchMode, filterSize, filterColor, filterGender, filterStatus, filterDesigner, filterMinPrice, filterMaxPrice, debugMode],
  );

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void runPhotoSearch(file);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) void runPhotoSearch(file);
    else setPhotoStatus("Please drop a JPG, PNG, or WEBP image");
  }

  function retrySearch() {
    if (photoFile) void runPhotoSearch(photoFile);
  }

  function clearPhotoSearch() {
    setPhotoFile(null);
    photoFileRef.current = null;
    setCorrectionRecordedId(null);
    setPhotoPreview("");
    setPhotoData(null);
    setPhotoStatus("");
    setSearchEngine("");
    setScreenshotWarning(false);
  }

  async function confirmDressMatch(
    correctItemId: number,
    predicted?: { id?: number; sku?: string; confidence?: number },
  ) {
    const file = photoFileRef.current ?? photoFile;
    if (!file) {
      setPhotoStatus("Could not record correction — please re-upload the photo.");
      return;
    }
    const form = new FormData();
    form.append("photo", file);
    form.append("correct_item_id", String(correctItemId));
    if (predicted?.id) form.append("predicted_item_id", String(predicted.id));
    if (predicted?.sku) form.append("predicted_sku", predicted.sku);
    if (predicted?.confidence != null) form.append("confidence", String(predicted.confidence));
    try {
      const res = await fetch("/api/dress-checker/correction", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhotoStatus(data?.error || "Could not record correction.");
        return;
      }
      setCorrectionRecordedId(correctItemId);
      setPhotoStatus("Correction recorded — thank you.");
    } catch {
      setPhotoStatus("Could not record correction.");
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="fa-solid fa-sliders" style={{ color: "var(--gold)", fontSize: 18 }} />
                <label style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>Mode</label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["AUTO", "MANUAL", "ALL"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`btn btn-sm ${searchMode === mode ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setSearchMode(mode);
                      if (mode === "ALL") {
                        setCategory("");
                        setSubCategory("");
                      }
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {searchMode === "AUTO"
                  ? "Predict category from the photo, then search that category."
                  : searchMode === "ALL"
                    ? "Search complete inventory (no category filter)."
                    : "Use the selected category / subcategory."}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
                <CategorySelect
                  value={category}
                  onChange={(v) => {
                    setCategory(v);
                    setSubCategory("");
                    if (v && searchMode === "ALL") setSearchMode("MANUAL");
                  }}
                />
              </div>
              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Subcategory</label>
                <select
                  className="form-control"
                  value={subCategory}
                  disabled={searchMode === "ALL" || searchMode === "AUTO"}
                  onChange={(e) => {
                    setSubCategory(e.target.value);
                    if (e.target.value && searchMode === "ALL") setSearchMode("MANUAL");
                  }}
                >
                  <option value="">All subcategories</option>
                  {subCategoryOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {searchMode === "ALL" || (!category && searchMode !== "AUTO") ? (
                <strong>Searching entire inventory.</strong>
              ) : searchMode === "AUTO" ? (
                <span>
                  <strong>AUTO</strong> — category will be predicted from the photo.
                </span>
              ) : category && subCategory ? (
                <>
                  Searching in:{" "}
                  <strong style={{ color: "var(--primary)" }}>
                    {category} &gt; {subCategory}
                  </strong>
                </>
              ) : category ? (
                <>
                  Searching in: <strong style={{ color: "var(--primary)" }}>{category}</strong>
                </>
              ) : (
                <strong>Searching entire inventory.</strong>
              )}
            </div>
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

        <div className="card" style={{ position: "relative", zIndex: 2 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-camera" style={{ marginRight: 8, color: "var(--gold)" }} />
              Search by Photo
            </h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              Upload or capture a photo — multi-stage identification matches the exact inventory item (not just similar dresses).
            </p>

            {IS_DEV && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
              Debug mode (dev only) — component scores, top 20 matches, timing
            </label>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 12,
                padding: "20px 16px",
                textAlign: "center",
                marginBottom: 14,
                background: dragOver ? "var(--primary)08" : "var(--bg)",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 28, color: "var(--text-muted)", marginBottom: 8, display: "block" }} />
              <div style={{ fontSize: 13, marginBottom: 10 }}>Drag & drop a photo here</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <label className="btn btn-primary btn-sm" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i className="fa-solid fa-upload" />
                  Upload
                  <input ref={fileInputRef} type="file" accept={PHOTO_ACCEPT} style={{ display: "none" }} onChange={handleFileSelect} />
                </label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => setCameraOpen(true)}
                >
                  <i className="fa-solid fa-camera" />
                  Camera
                </button>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                JPG, PNG, WEBP · max {MAX_PHOTO_MB}MB
              </div>
            </div>

            <details style={{ marginBottom: 14 }}>
              <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                <i className="fa-solid fa-filter" style={{ marginRight: 6 }} />
                Photo search filters
              </summary>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 10,
                  padding: "10px 0",
                }}
              >
                <FilterField label="Size">
                  <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} style={inputStyle}>
                    <option value="">Any</option>
                    {SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Colour">
                  <input type="text" value={filterColor} onChange={(e) => setFilterColor(e.target.value)} placeholder="e.g. red" style={inputStyle} />
                </FilterField>
                <FilterField label="Gender">
                  <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} style={inputStyle}>
                    <option value="">Any</option>
                    <option value="mens">Men&apos;s</option>
                    <option value="womens">Women&apos;s</option>
                  </select>
                </FilterField>
                <FilterField label="Availability">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputStyle}>
                    <option value="">Any</option>
                    <option value="available">Available</option>
                    <option value="rented">Rented</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </FilterField>
                <FilterField label="Designer tier">
                  <select value={filterDesigner} onChange={(e) => setFilterDesigner(e.target.value)} style={inputStyle}>
                    <option value="">Any</option>
                    {SUB_CATEGORIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Min rate ₹">
                  <input type="number" min={0} value={filterMinPrice} onChange={(e) => setFilterMinPrice(e.target.value)} style={inputStyle} />
                </FilterField>
                <FilterField label="Max rate ₹">
                  <input type="number" min={0} value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} style={inputStyle} />
                </FilterField>
              </div>
            </details>

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
                  style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {photoLoading ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
                        Analysing…
                      </>
                    ) : (
                      photoStatus
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {searchEngine || "Multi-stage identification pipeline"}
                    {photoData?.detected_category && photoData.detected_category !== photoData.category && (
                      <> · detected {photoData.detected_category}</>
                    )}
                  </div>
                {!!photoData?.reliable_identification &&
                  (photoData.category_results[0] || photoData.other_results[0]) && (
                  <div style={{ fontSize: 11, color: "#68d391", marginTop: 2 }}>
                    Identified: {(photoData.category_results[0] || photoData.other_results[0])?.display_name ||
                      (photoData.category_results[0] || photoData.other_results[0])?.name} (
                    {photoData.best_similarity ||
                      (photoData.category_results[0] || photoData.other_results[0])?.similarity ||
                      0}
                    %)
                  </div>
                )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={retrySearch} disabled={photoLoading || !photoFile}>
                    <i className="fa-solid fa-rotate-right" />
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={clearPhotoSearch} disabled={photoLoading}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>
            )}

            {photoData?.image_warnings?.length ? (
              <div style={{ fontSize: 11, color: "#fbd38d", marginBottom: 12 }}>
                {photoData.image_warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            ) : null}

            {photoData?.search_scope_label && !photoLoading && (
              <div style={{ fontSize: 13, marginBottom: 10, color: "var(--text-primary)" }}>
                {photoData.search_scope_label}
                {photoData.search_mode === "AUTO" && photoData.detected_category ? (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>
                    (AUTO predicted {photoData.detected_category}
                    {photoData.detected_subcategory ? ` › ${photoData.detected_subcategory}` : ""})
                  </span>
                ) : null}
              </div>
            )}

            {photoData?.category_filter_diagnostics && !photoLoading && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 12,
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  Candidates before filtering:{" "}
                  <strong>{photoData.category_filter_diagnostics.candidates_before_filtering}</strong>
                </span>
                <span>
                  Candidates after filtering:{" "}
                  <strong>{photoData.category_filter_diagnostics.candidates_after_filtering}</strong>
                </span>
              </div>
            )}

            {photoData?.offer_search_entire_inventory && !photoLoading && photoFile && (
              <div
                role="status"
                style={{
                  padding: "12px 14px",
                  marginBottom: 14,
                  borderRadius: 10,
                  border: "1px solid rgba(123,31,69,0.35)",
                  background: "rgba(123,31,69,0.06)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span>No matches in the selected category. Search entire inventory instead?</span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setSearchMode("ALL");
                    setCategory("");
                    setSubCategory("");
                    void runPhotoSearch(photoFile, { mode: "ALL", category: "", subCategory: "" });
                  }}
                >
                  Search entire inventory
                </button>
              </div>
            )}

            {photoData?.search_degraded && !photoLoading && (
              <SearchDegradationBanner
                code={photoData.fallback_code || photoData.degradation?.code || "SEARCH_DEGRADED_HASH"}
                reason={
                  photoData.fallback_reason ||
                  photoData.degradation?.reason ||
                  "pgvector search failed — using hash brute-force"
                }
                searchEngine={photoData.search_engine}
              />
            )}

            {photoData?.identification_meta?.ambiguous_match && !photoLoading && !correctionRecordedId && (
              <div
                style={{
                  position: "relative",
                  zIndex: 10002,
                  padding: "12px 14px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "rgba(251,211,141,0.12)",
                  border: "1px solid #fbd38d",
                  fontSize: 12,
                }}
              >
                <strong>Multiple possible matches — confirm the correct dress:</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {photoData.identification_meta.ambiguous_candidates.map((c) => (
                    <div
                      key={c.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}
                    >
                      <span>
                        {c.display_name || c.name} · {c.sku} · {c.similarity}%
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const predicted = photoData.identification_meta?.ambiguous_candidates[0];
                          void confirmDressMatch(c.id, {
                            id: predicted?.id,
                            sku: predicted?.sku,
                            confidence: photoData.identification_meta?.top_confidence ?? photoData.best_similarity,
                          });
                        }}
                      >
                        This is correct
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {photoData?.identification_meta?.decision === "unreliable" &&
              photoData.identification_meta.ambiguous_candidates.length > 0 &&
              !photoLoading &&
              !correctionRecordedId && (
              <div
                style={{
                  position: "relative",
                  zIndex: 10002,
                  padding: "12px 14px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "rgba(160,174,192,0.12)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              >
                <strong>No reliable identification — select the correct dress if shown:</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {photoData.identification_meta.ambiguous_candidates.map((c) => (
                    <div
                      key={c.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}
                    >
                      <span>
                        {c.display_name || c.name} · {c.sku} · {c.similarity}%
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const predicted = photoData.identification_meta?.ambiguous_candidates[0];
                          void confirmDressMatch(c.id, {
                            id: predicted?.id,
                            sku: predicted?.sku,
                            confidence: photoData.identification_meta?.top_confidence ?? photoData.best_similarity,
                          });
                        }}
                      >
                        This is correct
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {screenshotWarning && !photoLoading && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "rgba(251,211,141,0.15)",
                  border: "1px solid #fbd38d",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6, color: "#fbd38d" }} />
                Upload the <strong>dress photo</strong> directly — not a screenshot of this page. Use Camera or Upload from your gallery.
              </div>
            )}

            {IS_DEV && debugMode && photoData?.dress_checker_debug && !photoLoading && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                <strong>Debug</strong> · {photoData.dress_checker_debug.embeddingModel} · dim{" "}
                {photoData.dress_checker_debug.embeddingDimension} · upload{" "}
                {photoData.dress_checker_debug.uploadedImage.width}×
                {photoData.dress_checker_debug.uploadedImage.height} (
                {Math.round(photoData.dress_checker_debug.uploadedImage.bytes / 1024)}KB) · embed{" "}
                {photoData.dress_checker_debug.embeddingGenerationMs}ms · search{" "}
                {photoData.dress_checker_debug.searchMs}ms · stale indexes{" "}
                {photoData.dress_checker_debug.staleIndexCount}
                {"detectedCategory" in photoData.dress_checker_debug &&
                  photoData.dress_checker_debug.detectedCategory && (
                    <>
                      <br />
                      <strong>Detected:</strong> {photoData.dress_checker_debug.detectedCategory} ·{" "}
                      {photoData.dress_checker_debug.detectedColour} · embroidery{" "}
                      {photoData.dress_checker_debug.detectedEmbroidery} · sleeve{" "}
                      {photoData.dress_checker_debug.detectedSleeve} · neckline{" "}
                      {photoData.dress_checker_debug.detectedNeckline}
                    </>
                  )}
                {photoData.pipeline_stages && (
                  <>
                    <br />
                    Stage A: {photoData.pipeline_stages.stage_a_category} ·{" "}
                    {photoData.pipeline_stages.stage_b_candidates} candidates
                  </>
                )}
                {(() => {
                  const rejected = (photoData.dress_checker_debug as unknown as {
                    rejectedCandidates?: Array<{ sku: string; score: number; reason: string }>;
                  }).rejectedCandidates;
                  return rejected?.length ? (
                    <>
                      <br />
                      <strong>Rejected:</strong>{" "}
                      {rejected.map((r) => `${r.sku} ${r.score}% (${r.reason})`).join(" · ")}
                    </>
                  ) : null;
                })()}
                {photoData.dress_checker_debug.candidateFilterStages && (
                  <>
                    <br />
                    <strong>Filter stages:</strong>{" "}
                    {photoData.dress_checker_debug.candidateFilterStages
                      .map((s) => `${s.name} ${s.before}→${s.after}`)
                      .join(" · ")}
                  </>
                )}
                {photoData.dress_checker_debug.pipelineStages && (
                  <>
                    <br />
                    <strong>Pipeline:</strong>{" "}
                    {photoData.dress_checker_debug.pipelineStages
                      .map((s) => `${s.stage} ${s.durationMs}ms`)
                      .join(" · ")}
                  </>
                )}
                {(() => {
                  const vlm = (photoData.dress_checker_debug as unknown as {
                    vlm?: {
                      used: boolean;
                      confidence: number;
                      reasoning: string;
                      perCandidate: Array<{ sku: string; sameDress: boolean; confidence: number; notes: string }>;
                      error?: string;
                    };
                  }).vlm;
                  if (!vlm) return null;
                  return (
                    <>
                      <br />
                      <strong>OpenAI Vision:</strong>{" "}
                      {vlm.used
                        ? `match ${vlm.confidence}% — ${vlm.reasoning}`
                        : `not used${vlm.error ? ` (${vlm.error})` : ""}`}
                      {vlm.perCandidate?.length ? (
                        <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                          {vlm.perCandidate.map((p) => (
                            <li key={p.sku}>
                              {p.sku} — {p.sameDress ? "SAME" : "different"} {p.confidence}% · {p.notes}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </>
                  );
                })()}
                {photoData.dress_checker_debug.topMatches.length > 0 && (
                  <>
                    <br />
                    <strong>Top matches (recall):</strong>
                    <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                      {photoData.dress_checker_debug.topMatches.slice(0, 20).map((m) => (
                        <li key={m.rank}>
                          {m.sku} {m.finalScore}% — visual {m.globalScore}% · colour {m.colorScore}% ·
                          embroidery {m.embroideryScore}% · border {m.borderScore}% · silhouette {m.textureScore}%
                          {m.rejectedRules?.length ? ` · rejected: ${m.rejectedRules.join(", ")}` : ""}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}

            {IS_DEV && debugMode && photoData?.pipeline_stages && !photoData?.dress_checker_debug && !photoLoading && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 14,
                  borderRadius: 8,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                <strong>Pipeline:</strong> Stage A category = {photoData.pipeline_stages.stage_a_category || "—"} ·{" "}
                {photoData.pipeline_stages.stage_b_candidates} candidates · {photoData.pipeline_stages.stage_c_scored}{" "}
                scored
                {photoData.category_detection && (
                  <>
                    <br />
                    <strong>Category scores:</strong>{" "}
                    {Object.entries(photoData.category_detection.scores)
                      .map(([k, v]) => `${k} ${v}%`)
                      .join(" · ")}
                  </>
                )}
              </div>
            )}

            {photoHasResults && photoData && (
              <ResultsList
                catResults={photoData.category_results}
                otherResults={photoData.other_results}
                usedFallback={photoData.used_fallback}
                category={photoData.category}
                renderRow={(item) => <PhotoResultRow item={item} debugMode={debugMode} />}
              />
            )}

            {photoData?.similar_available?.length ? (
              <div style={{ marginTop: 14 }}>
                <SectionHeader
                  label="Similar Available Dresses"
                  bg="rgba(104,211,145,0.12)"
                  color="#1f6f45"
                />
                <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px" }}>
                  {photoData.similar_available.slice(0, 5).map((item) => (
                    <TextResultRow key={`similar-${item.id}`} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {!photoPreview && (
              <div style={{ textAlign: "center", padding: "24px 20px", color: "var(--text-muted)" }}>
                <i className="fa-solid fa-camera" style={{ fontSize: 36, marginBottom: 12, display: "block", opacity: 0.25 }} />
                Upload or capture a photo to search
              </div>
            )}
          </div>
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        title="Dress Checker — Take Photo"
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          void runPhotoSearch(file);
        }}
      />
    </div>
  );
}
