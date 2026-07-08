"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson, isTransientNetworkError } from "@/lib/fetchJson";
import { FinanceChart } from "@/components/finance/FinanceChart";

type HealthColor = "green" | "yellow" | "red";

interface HealthComponent { key: string; label: string; weight: number; score: number; contribution: number }
interface HealthRecommendation { id: string; text: string; href?: string }

interface HealthScoreReport {
  generatedAt: string;
  dateIso: string;
  score: number;
  band: string;
  color: HealthColor;
  emoji: string;
  components: HealthComponent[];
  positives: string[];
  negatives: string[];
  recommendations: HealthRecommendation[];
  history: { labels: string[]; values: number[] };
  meta: { durationMs: number; sources: string[]; cached: boolean; generatedFor: string; weightTotal: number };
}

const COLOR_VAR: Record<HealthColor, string> = {
  green: "var(--success)",
  yellow: "#b8860b",
  red: "var(--danger)",
};

function scoreColorVar(score: number): string {
  if (score >= 75) return COLOR_VAR.green;
  if (score >= 60) return COLOR_VAR.yellow;
  return COLOR_VAR.red;
}

export default function HealthScore() {
  const [data, setData] = useState<HealthScoreReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<HealthScoreReport>(
        `/api/dashboard/health-score${refresh ? "?refresh=1" : ""}`,
      );
      setData(json);
    } catch (e) {
      if (!isTransientNetworkError(e)) {
        setError(e instanceof Error ? e.message : "Could not load the health score.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
          <i className="fa-solid fa-heart-pulse" style={{ marginRight: 8 }} />
          Calculating your business health score…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: "20px" }}>
          <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load(false)}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const color = scoreColorVar(data.score);

  return (
    <div className="card" style={{ marginBottom: 20, borderTop: `4px solid ${color}` }}>
      <div className="card-header">
        <h3 className="card-title">
          <i className="fa-solid fa-heart-pulse" style={{ marginRight: 8, color }} />
          AI Business Health Score
        </h3>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          <i className={`fa-solid fa-rotate${refreshing ? " fa-spin" : ""}`} style={{ marginRight: 6 }} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) 1fr", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          {/* Score dial */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: "50%",
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: `conic-gradient(${color} ${data.score * 3.6}deg, var(--border) 0deg)`,
              }}
            >
              <div
                style={{
                  width: 130,
                  height: 130,
                  borderRadius: "50%",
                  background: "var(--card-bg, #fff)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontSize: 44, fontWeight: 800, color, lineHeight: 1 }}>{data.score}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>/ 100</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color }}>
              {data.emoji} {data.band}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {data.meta.cached ? "Cached · " : ""}updated {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          {/* Explanation */}
          <div style={{ minWidth: 260 }}>
            {data.positives.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", marginBottom: 4 }}>What&apos;s going well</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {data.positives.map((p, i) => (
                    <li key={i} style={{ fontSize: 13 }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.negatives.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>What&apos;s dragging it down</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {data.negatives.map((n, i) => (
                    <li key={i} style={{ fontSize: 13 }}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.positives.length === 0 && data.negatives.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>All key metrics are within a healthy range.</div>
            )}
          </div>
        </div>

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <i className="fa-solid fa-clipboard-check" style={{ marginRight: 6, color: "var(--success)" }} />
              Recommended actions
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {data.recommendations.map((r) => {
                const inner = <span style={{ fontSize: 13 }}>{r.text}</span>;
                return r.href ? (
                  <Link key={r.id} href={r.href} style={{ color: "var(--primary)", textDecoration: "none" }}>
                    <i className="fa-solid fa-arrow-right" style={{ marginRight: 8, fontSize: 11 }} />{inner}
                  </Link>
                ) : (
                  <div key={r.id}>{inner}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* Component breakdown */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Score breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {data.components.map((c) => (
              <div key={c.key} style={{ fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 600, color: scoreColorVar(c.score) }}>{c.score}</span>
                </div>
                <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginTop: 3 }}>
                  <div style={{ width: `${c.score}%`, height: "100%", background: scoreColorVar(c.score) }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Weight {c.weight}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* History trend */}
        {data.history.values.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <i className="fa-solid fa-chart-line" style={{ marginRight: 6 }} />
              Health Score History
            </div>
            <FinanceChart type="bar" labels={data.history.labels} values={data.history.values} title="Health score over time" height={220} />
          </div>
        )}
      </div>
    </div>
  );
}
