"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, isTransientNetworkError, ApiError } from "@/lib/fetchJson";

type QueryDetected = {
  category: string;
  colours: {
    primary: string;
    secondary: string;
    accents: string[];
    family: string;
    label: string;
  };
  motifs: string[];
  embroideryDensity: number;
  embroideryStyle: string;
  embroideryLabel: string;
};

type DebugCandidate = {
  rank: number;
  itemId: number;
  sku: string;
  name: string;
  photo: string;
  category: string;
  embeddingScore: number;
  colourScore: number;
  borderScore: number;
  motifScore: number;
  stoneScore: number;
  textureScore: number | null;
  identityScore: number | null;
  openAiScore: number;
  finalScore: number;
  rejected: boolean;
  rejectReason?: string;
  reasons: string[];
  rankReason: string;
  openAiVerification: {
    exactMatch: boolean;
    confidence: number;
    reasoning: string;
    reasons?: string[];
  } | null;
};

type SearchResponse = {
  processing_time_ms: number;
  identification_meta: {
    decision: string;
    confidence: number;
    message: string;
    reasoning: string;
  };
  best_similarity: number;
  query_detected: QueryDetected;
  candidates: DebugCandidate[];
  rejected_candidates: DebugCandidate[];
  history_id?: string;
  history?: HistoryMeta[];
  ai_diagnostics?: {
    stages?: string[];
    fine_grained_ms?: number;
    vector_ms?: number;
    openai_verify_ms?: number;
    embedding_ms?: number;
  };
};

type HistoryMeta = {
  id: string;
  createdAt: string;
  categoryHint: string;
  processingTimeMs: number;
  decision: string;
  confidence: number;
  topSku: string | null;
  topName: string | null;
  candidateCount: number;
  rejectedCount: number;
  queryDetected: QueryDetected;
};

type HealthResponse = {
  pgvector: boolean;
  openaiVerification: boolean;
  searchHealth: { ok: boolean; issues: Array<{ code: string; message: string }> };
  history: HistoryMeta[];
};

const CATEGORIES = [
  "",
  "Lehenga",
  "Bridal Lehenga",
  "Saree",
  "Gown",
  "Reception Gown",
  "Sherwani",
  "Jewellery",
];

function scoreBar(score: number | null | undefined) {
  if (score == null) {
    return <span style={{ color: "#a0aec0", fontSize: 12 }}>—</span>;
  }
  const color = score >= 85 ? "#1a7a3c" : score >= 60 ? "#b7791f" : "#c53030";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 40,
          height: 6,
          background: "#e2e8f0",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, score))}%`,
            height: "100%",
            background: color,
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 36 }}>{score}%</span>
    </div>
  );
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CandidateTable({
  rows,
  showRejectReason,
}: {
  rows: DebugCandidate[];
  showRejectReason?: boolean;
}) {
  if (!rows.length) {
    return <p style={{ color: "#718096", fontSize: 13 }}>None</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Embedding</th>
            <th>Colour</th>
            <th>Border</th>
            <th>Motif</th>
            <th>Stone</th>
            <th>Texture</th>
            <th>Identity</th>
            <th>GPT</th>
            <th>Final</th>
            {showRejectReason ? <th>Reject reason</th> : <th>Notes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.itemId}
              style={m.rejected ? { background: "#fff5f5" } : undefined}
            >
              <td>{m.rank}</td>
              <td>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.photo}
                    alt=""
                    style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 4 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.sku}</div>
                    <div style={{ color: "#718096" }}>{m.name}</div>
                    <div style={{ color: "#a0aec0", fontSize: 11 }}>{m.category}</div>
                  </div>
                </div>
              </td>
              <td>{scoreBar(m.embeddingScore)}</td>
              <td>{scoreBar(m.colourScore)}</td>
              <td>{scoreBar(m.borderScore)}</td>
              <td>{scoreBar(m.motifScore)}</td>
              <td>{scoreBar(m.stoneScore)}</td>
              <td>{scoreBar(m.textureScore)}</td>
              <td>{scoreBar(m.identityScore)}</td>
              <td>
                {m.openAiScore > 0 ? (
                  <span
                    style={{
                      color: m.openAiVerification?.exactMatch ? "#1a7a3c" : "#c53030",
                      fontWeight: 600,
                    }}
                  >
                    {m.openAiScore}%
                    {m.openAiVerification?.exactMatch ? " ✓" : " ✗"}
                  </span>
                ) : (
                  <span style={{ color: "#a0aec0" }}>—</span>
                )}
              </td>
              <td>
                <strong>{m.finalScore}%</strong>
              </td>
              <td style={{ maxWidth: 260, fontSize: 11, color: "#4a5568" }}>
                {showRejectReason ? (
                  <span style={{ color: "#c53030", fontWeight: 600 }}>
                    {m.rejectReason || "Rejected"}
                  </span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {m.reasons.slice(0, 4).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DressCheckerDebugClient() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [history, setHistory] = useState<HistoryMeta[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchJson<HealthResponse>("/api/admin/dress-checker-debug")
      .then((data) => {
        setHealth(data);
        setHistory(data.history ?? []);
      })
      .catch(() => setHealth(null));
  }, []);

  const runSearch = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a photo first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("photo", file);
    if (category) form.append("category", category);

    try {
      const data = await fetchJson<SearchResponse>("/api/admin/dress-checker-debug", {
        method: "POST",
        body: form,
      });
      setResult(data);
      setHistoryId(data.history_id ?? null);
      if (data.history) setHistory(data.history);
    } catch (e) {
      if (isTransientNetworkError(e)) {
        setError(
          "Connection lost while searching (often during dev recompile or a long OpenAI verify). Wait for the server to finish, then retry — searches can take 30–60 seconds.",
        );
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Search failed");
      }
    } finally {
      setLoading(false);
    }
  }, [category]);

  const loadHistory = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ entry: { id: string; payload: SearchResponse } }>(
        `/api/admin/dress-checker-debug?id=${encodeURIComponent(id)}`,
      );
      setResult(data.entry.payload);
      setHistoryId(data.entry.id);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const topCandidates = result?.candidates.filter((c) => !c.rejected) ?? [];
  const rejected = result?.rejected_candidates ?? [];

  return (
    <div style={{ marginTop: 20 }}>
      {health && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
            padding: 12,
            background: "#f7fafc",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <span>
            pgvector:{" "}
            <strong style={{ color: health.pgvector ? "#1a7a3c" : "#c53030" }}>
              {health.pgvector ? "OK" : "Missing"}
            </strong>
          </span>
          <span>
            OpenAI verify:{" "}
            <strong style={{ color: health.openaiVerification ? "#1a7a3c" : "#b7791f" }}>
              {health.openaiVerification ? "Enabled" : "Disabled"}
            </strong>
          </span>
          <span style={{ color: "#718096" }}>History: {history.length}/100</span>
          {!health.searchHealth.ok && (
            <span style={{ color: "#c53030" }}>
              Issues: {health.searchHealth.issues.map((i) => i.code).join(", ")}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} />
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13, marginRight: 8 }}>Category hint:</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c || "all"} value={c}>
                  {c || "All categories"}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={loading}
            onClick={() => void runSearch()}
          >
            {loading ? "Searching… (30–60s)" : "Run Dress Checker"}
          </button>
          {loading && (
            <p style={{ color: "#718096", fontSize: 12, marginTop: 8 }}>
              Running pgvector + fine-grained re-rank + GPT verify. Do not refresh during this step.
            </p>
          )}
          {error && <p style={{ color: "#c53030", fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Query preview"
            style={{ maxWidth: 200, maxHeight: 280, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
        )}
      </div>

      {result && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: 12,
                background: "#edf2f7",
                borderRadius: 8,
                fontSize: 13,
                flex: 1,
                minWidth: 280,
              }}
            >
              <strong>Decision:</strong> {result.identification_meta.decision} (
              {result.identification_meta.confidence.toFixed(1)}%) —{" "}
              {result.identification_meta.message}
              <br />
              <span style={{ color: "#4a5568" }}>{result.identification_meta.reasoning}</span>
              <br />
              <span style={{ color: "#718096" }}>
                {result.processing_time_ms}ms
                {result.ai_diagnostics?.stages?.length
                  ? ` · stages: ${result.ai_diagnostics.stages.join(" → ")}`
                  : ""}
              </span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadJson(
                  `dress-checker-debug-${historyId || "latest"}.json`,
                  result,
                )
              }
            >
              Download diagnostics JSON
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              ["Detected category", result.query_detected.category || "—"],
              [
                "Detected colours",
                [
                  result.query_detected.colours.label,
                  result.query_detected.colours.secondary,
                  ...(result.query_detected.colours.accents || []),
                ]
                  .filter(Boolean)
                  .join(", ") || "—",
              ],
              [
                "Detected motifs",
                result.query_detected.motifs.length
                  ? result.query_detected.motifs.join(", ")
                  : "—",
              ],
              [
                "Embroidery density",
                `${result.query_detected.embroideryDensity}% · ${
                  result.query_detected.embroideryLabel ||
                  result.query_detected.embroideryStyle ||
                  "—"
                }`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: 12,
                  background: "#f7fafc",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: 11, color: "#718096", textTransform: "uppercase" }}>
                  {label}
                </div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Top candidates</h2>
          <CandidateTable rows={topCandidates} />

          <h2 style={{ fontSize: 16, margin: "24px 0 8px" }}>
            Rejected candidates ({rejected.length})
          </h2>
          <CandidateTable rows={rejected} showRejectReason />
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Last searches ({history.length}/100)</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Decision</th>
                  <th>Query</th>
                  <th>Top match</th>
                  <th>Rejected</th>
                  <th>ms</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    style={
                      historyId === h.id ? { background: "#ebf8ff" } : undefined
                    }
                  >
                    <td>{new Date(h.createdAt).toLocaleString()}</td>
                    <td>
                      {h.decision} ({h.confidence.toFixed(0)}%)
                    </td>
                    <td>
                      {h.queryDetected.category || "—"} · {h.queryDetected.colours.label || "—"}
                    </td>
                    <td>
                      {h.topSku || "—"}
                      {h.topName ? (
                        <span style={{ color: "#718096" }}> · {h.topName}</span>
                      ) : null}
                    </td>
                    <td>{h.rejectedCount}</td>
                    <td>{h.processingTimeMs}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 11, padding: "4px 8px" }}
                        disabled={loading}
                        onClick={() => void loadHistory(h.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
