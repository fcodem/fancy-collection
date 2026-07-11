"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import type { DressCheckerEmbeddingSource } from "@/lib/inventoryAiProfile/dressCheckerFields";
import type { ItemSearchTestResult, SearchTestMatch } from "@/lib/ai/aiDebugTests";

type DebugItem = {
  itemId: number;
  status: string;
  embeddingExists: boolean;
  embeddingSource: DressCheckerEmbeddingSource;
  hashExists: boolean;
  lastProcessed: string | null;
  failureReason: string | null;
};

type DressCheckerHealthIssue = {
  code: string;
  severity: "critical" | "warning" | "info";
  message: string;
  remediation: string;
};

type SearchHealth = {
  ok: boolean;
  pgvector: boolean;
  openaiVerificationEnabled: boolean;
  openaiKeyConfigured: boolean;
  inventoryWithPhoto: number;
  aiProfiles: number;
  pgvectorEmbeddings: number;
  issues: DressCheckerHealthIssue[];
  checkedAt: string;
};

type DebugPayload = {
  pgvector: boolean;
  searchHealth: SearchHealth;
  stats: {
    totalProfiles: number;
    withEmbedding: number;
    withHash: number;
    ready: number;
    failed: number;
    processing: number;
    totalInventory: number;
  };
  items: DebugItem[];
};

type DebugAction =
  | "retry"
  | "reindex"
  | "bulk_rebuild"
  | "openai_test"
  | "pgvector_test"
  | "embedding_test"
  | "search_test";

function boolCell(ok: boolean) {
  return ok ? (
    <span style={{ color: "#1a7a3c", fontWeight: 600 }}>Yes</span>
  ) : (
    <span style={{ color: "#a0aec0" }}>No</span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function matchSummary(matches: SearchTestMatch[]) {
  if (!matches.length) return "—";
  return matches.map((m) => `${m.sku} (#${m.itemId})`).join(", ");
}

function scoreList(matches: SearchTestMatch[], field: keyof Pick<SearchTestMatch, "vectorSimilarity" | "openAiScore" | "finalScore">) {
  if (!matches.length) return "—";
  return matches.map((m) => m[field].toFixed(1)).join(" · ");
}

export default function AiDebugClient() {
  const [data, setData] = useState<DebugPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [globalBusy, setGlobalBusy] = useState<string | null>(null);
  const [searchTests, setSearchTests] = useState<Record<number, ItemSearchTestResult>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchJson<DebugPayload>("/api/admin/ai-debug");
      setData(payload);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function action(act: DebugAction, itemId?: number) {
    setMessage("");
    if (itemId) setBusyId(itemId);
    else setGlobalBusy(act);

    try {
      const r = await fetchJson<Record<string, unknown>>("/api/admin/ai-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act, itemId }),
      });

      if (act === "bulk_rebuild") {
        setMessage(`Bulk rebuild queued ${String(r.queued ?? 0)} items`);
        await refresh();
        return;
      }

      if (act === "openai_test") {
        setMessage(String(r.message || "OpenAI test passed"));
        return;
      }

      if (act === "pgvector_test") {
        setMessage(String(r.message || "pgvector test passed"));
        return;
      }

      if (act === "embedding_test") {
        setMessage(String(r.message || "Embedding test passed"));
        return;
      }

      if (act === "search_test" && itemId) {
        const test = r as unknown as ItemSearchTestResult;
        setSearchTests((prev) => ({ ...prev, [itemId]: test }));
        const selfNote =
          test.selfRank != null ? ` (self rank #${test.selfRank})` : " (self not in top 5)";
        setMessage(
          test.ok
            ? `Search test item ${itemId}: ${test.topMatches.length} matches in ${test.processingTimeMs}ms${selfNote}`
            : `Search test failed for item ${itemId}: ${test.error}`,
        );
        return;
      }

      setMessage(
        act === "reindex"
          ? `Full reindex started for item ${itemId}`
          : `Retry started for item ${itemId}`,
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
      setGlobalBusy(null);
    }
  }

  const s = data?.stats;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {data?.searchHealth && !data.searchHealth.ok && (
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #c00" }}>
          <strong>Dress Checker search is degraded</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {data.searchHealth.issues
              .filter((i) => i.severity === "critical")
              .map((issue) => (
                <li key={issue.code} style={{ marginBottom: 8 }}>
                  <code>{issue.code}</code> — {issue.message}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Dress Checker Debug</h3>
          <button className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {s && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 12 }}>
            <Stat label="Inventory w/ photo" value={s.totalInventory} />
            <Stat label="pgvector indexed" value={data.searchHealth?.pgvectorEmbeddings ?? s.withEmbedding} />
            <Stat label="AI profiles" value={s.totalProfiles} />
            <Stat label="Ready" value={s.ready} good />
            <Stat label="Failed" value={s.failed} bad={s.failed > 0} />
            <Stat label="Processing" value={s.processing} />
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={!!globalBusy}
            onClick={() => action("bulk_rebuild")}
          >
            {globalBusy === "bulk_rebuild" ? "…" : "Bulk Rebuild"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={!!globalBusy}
            onClick={() => action("openai_test")}
          >
            {globalBusy === "openai_test" ? "…" : "OpenAI Test"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={!!globalBusy}
            onClick={() => action("pgvector_test")}
          >
            {globalBusy === "pgvector_test" ? "…" : "pgvector Test"}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={!!globalBusy}
            onClick={() => action("embedding_test")}
          >
            {globalBusy === "embedding_test" ? "…" : "Embedding Test"}
          </button>
        </div>

        {message && (
          <p style={{ marginTop: 10, fontSize: 13, color: message.toLowerCase().includes("fail") ? "#c00" : "#333" }}>
            {message}
          </p>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="table" style={{ margin: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Status</th>
              <th>Embedding Exists</th>
              <th>Hash Exists</th>
              <th>Last Processed</th>
              <th>Failure Reason</th>
              <th>Top Matches</th>
              <th>Similarity Scores</th>
              <th>OpenAI Score</th>
              <th>Final Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => {
              const test = searchTests[row.itemId];
              const matches = test?.topMatches ?? [];
              const rowBusy = busyId === row.itemId;

              return (
                <tr key={row.itemId}>
                  <td>
                    <a href={`/inventory/${row.itemId}`}>{row.itemId}</a>
                  </td>
                  <td>
                    <span
                      style={{
                        color:
                          row.status === "ready" || row.status === "completed"
                            ? "#1a7a3c"
                            : row.status === "failed" || row.status === "error"
                              ? "#c00"
                              : "#888",
                      }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td title={row.embeddingSource}>{boolCell(row.embeddingExists)}</td>
                  <td>{boolCell(row.hashExists)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(row.lastProcessed)}</td>
                  <td style={{ maxWidth: 160, color: row.failureReason ? "#c00" : "#a0aec0" }}>
                    {row.failureReason?.slice(0, 80) ?? "—"}
                  </td>
                  <td style={{ maxWidth: 180, fontSize: 11 }} title={matchSummary(matches)}>
                    {test?.error ? (
                      <span style={{ color: "#c00" }}>{test.error}</span>
                    ) : (
                      matchSummary(matches)
                    )}
                  </td>
                  <td style={{ fontSize: 11 }}>{scoreList(matches, "vectorSimilarity")}</td>
                  <td style={{ fontSize: 11 }}>{scoreList(matches, "openAiScore")}</td>
                  <td style={{ fontSize: 11, fontWeight: 600 }}>{scoreList(matches, "finalScore")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 10, padding: "2px 6px", marginRight: 4 }}
                      disabled={rowBusy}
                      onClick={() => action("retry", row.itemId)}
                    >
                      Retry
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 10, padding: "2px 6px", marginRight: 4 }}
                      disabled={rowBusy}
                      onClick={() => action("reindex", row.itemId)}
                    >
                      Reindex
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 10, padding: "2px 6px" }}
                      disabled={rowBusy}
                      onClick={() => action("search_test", row.itemId)}
                    >
                      {rowBusy ? "…" : "Search"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data?.items.length && !loading && (
          <p style={{ padding: 16, color: "#888" }}>No AI profiles yet. Run Bulk Rebuild.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div style={{ padding: "10px 12px", background: "#fafafa", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: bad ? "#c00" : good ? "#1a7a3c" : "#333" }}>{value}</div>
    </div>
  );
}
