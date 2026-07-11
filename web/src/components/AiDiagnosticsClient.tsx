"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { remediationForIssueCode } from "@/lib/dressChecker/issueRemediation";

type HealthIssue = {
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
  issues: HealthIssue[];
  checkedAt: string;
};

export default function AiDiagnosticsClient() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [searchHealth, setSearchHealth] = useState<SearchHealth | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    try {
      const data = await fetchJson<{ searchHealth: SearchHealth }>(
        "/api/admin/recognition/search-diagnostics",
      );
      setSearchHealth(data.searchHealth);
    } catch {
      /* health panel is optional */
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function runDiagnostics() {
    if (!photo) return;
    setLoading(true);
    const form = new FormData();
    form.append("photo", photo);
    if (category) form.append("category", category);
    try {
      const data = await fetchJson<Record<string, unknown>>(
        "/api/admin/recognition/search-diagnostics",
        { method: "POST", body: form },
      );
      setResult(data);
      if (data.searchHealth && typeof data.searchHealth === "object") {
        setSearchHealth(data.searchHealth as SearchHealth);
      }
    } finally {
      setLoading(false);
    }
  }

  const degraded = !!result?.search_degraded;
  const fallbackCode = String(result?.fallback_code || result?.degradation && (result.degradation as { code?: string }).code || "");
  const fallbackReason = String(result?.fallback_reason || result?.degradation && (result.degradation as { reason?: string }).reason || "");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {searchHealth && !searchHealth.ok && (
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #c00" }}>
          <strong>Dress Checker pre-flight issues</strong>
          <p style={{ margin: "8px 0 12px", fontSize: 13, color: "#666" }}>
            Photo search will degrade to hash fallback until critical issues are resolved.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {searchHealth.issues
              .filter((i) => i.severity === "critical")
              .map((issue) => (
                <li key={issue.code} style={{ marginBottom: 8 }}>
                  <code>{issue.code}</code> — {issue.message}
                  <div style={{ color: "#666", fontSize: 12 }}>{issue.remediation}</div>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>AI Search Diagnostics</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Upload a query image to run the production pgvector search path with full degradation metadata.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input type="file" accept="image/*" className="form-input" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          <input className="form-input" placeholder="Optional category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={runDiagnostics} disabled={!photo || loading}>
            {loading ? "Running..." : "Run Diagnostics"}
          </button>
        </div>

        {degraded && (
          <div
            role="alert"
            style={{
              padding: 12,
              marginBottom: 12,
              borderRadius: 8,
              border: "1px solid #c53030",
              background: "rgba(197,48,48,0.08)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "#9b2c2c" }}>Search degraded to hash fallback</strong>
            <div style={{ marginTop: 4 }}>
              <code>{fallbackCode || "SEARCH_DEGRADED_HASH"}</code> — {fallbackReason}
            </div>
            {fallbackCode && (
              <div style={{ marginTop: 4, fontSize: 12, color: "#744210" }}>
                Fix: {remediationForIssueCode(fallbackCode)}
              </div>
            )}
          </div>
        )}

        {result && (
          <pre style={{ fontSize: 11, maxHeight: 520, overflow: "auto", background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
