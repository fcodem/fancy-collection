"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatInr } from "@/lib/format";
import { fetchJson, isTransientNetworkError } from "@/lib/fetchJson";
import { FinanceChart } from "@/components/finance/FinanceChart";

type Format = "inr" | "count" | "percent";

interface KpiCard {
  key: string;
  label: string;
  value: number;
  format: Format;
  href?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
  sub?: string;
}
interface Insight { id: string; text: string }
interface Recommendation { id: string; text: string; href?: string }
interface PriorityAlert { id: string; severity: "critical" | "warning"; title: string; detail: string; href?: string }
interface UpcomingEvent { id: string; title: string; detail: string; href?: string }
interface Forecast { id: string; title: string; value: number; format: "inr" | "count"; basis: string; label: string }
interface FollowUpQuestion { id: string; text: string; href: string }

interface ExecBriefingData {
  generatedAt: string;
  dateIso: string;
  greeting: string;
  kpis: KpiCard[];
  insights: Insight[];
  recommendations: Recommendation[];
  alerts: PriorityAlert[];
  upcomingEvents: UpcomingEvent[];
  forecasts: Forecast[];
  followUps: FollowUpQuestion[];
  trend: { labels: string[]; values: number[] };
  meta: { durationMs: number; sources: string[]; cached: boolean; generatedFor: string };
}

const TONE_GRADIENT: Record<NonNullable<KpiCard["tone"]>, string> = {
  primary: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
  success: "linear-gradient(135deg,#2E7D32,#1b5e20)",
  warning: "linear-gradient(135deg,#b8860b,#8a6d1a)",
  danger: "linear-gradient(135deg,#dc3545,#c0392b)",
  info: "linear-gradient(135deg,#1565C0,#0d47a1)",
};

function formatValue(value: number, format: Format): string {
  if (format === "inr") return `₹${formatInr(value)}`;
  if (format === "percent") return `${value}%`;
  return String(value);
}

export default function ExecBriefing() {
  const [data, setData] = useState<ExecBriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<ExecBriefingData>(
        `/api/dashboard/exec-briefing${refresh ? "?refresh=1" : ""}`,
      );
      setData(json);
    } catch (e) {
      if (!isTransientNetworkError(e)) {
        setError(e instanceof Error ? e.message : "Could not load the briefing.");
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
          <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 8 }} />
          Generating your executive briefing…
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

  const generatedTime = new Date(data.generatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="exec-briefing" style={{ marginBottom: 24 }}>
      {/* Header */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
          color: "white",
          border: "none",
        }}
      >
        <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "18px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, background: "rgba(255,255,255,0.15)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              <i className="fa-solid fa-wand-magic-sparkles" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>{data.greeting}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Your AI Business Brief · generated {generatedTime}
                {data.meta.cached ? " · cached" : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.4)" }}
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <i className={`fa-solid fa-rotate${refreshing ? " fa-spin" : ""}`} style={{ marginRight: 8 }} />
            {refreshing ? "Refreshing…" : "Refresh AI Brief"}
          </button>
        </div>
      </div>

      {/* Priority Alerts */}
      {data.alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title"><i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />Priority Alerts</h3>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10 }}>
            {data.alerts.map((a) => {
              const critical = a.severity === "critical";
              const color = critical ? "var(--danger)" : "#b8860b";
              const bg = critical ? "rgba(220,53,69,0.08)" : "rgba(184,134,11,0.10)";
              const body = (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, background: bg, border: `1px solid ${color}` }}>
                  <span style={{ fontSize: 16 }}>{critical ? "🔴" : "🟡"}</span>
                  <div>
                    <div style={{ fontWeight: 700, color }}>{a.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{a.detail}</div>
                  </div>
                </div>
              );
              return a.href ? (
                <Link key={a.id} href={a.href} style={{ textDecoration: "none" }}>{body}</Link>
              ) : (
                <div key={a.id}>{body}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {data.kpis.map((k) => {
          const gradient = TONE_GRADIENT[k.tone || "primary"];
          const inner = (
            <div className="stat-card" style={{ background: gradient, color: "white", height: "100%" }}>
              <div className="stat-value" style={{ fontSize: 22 }}>{formatValue(k.value, k.format)}</div>
              <div className="stat-label">{k.label}</div>
              {k.sub && <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>{k.sub}</div>}
            </div>
          );
          return k.href ? (
            <Link key={k.key} href={k.href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>{inner}</Link>
          ) : (
            <div key={k.key}>{inner}</div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><i className="fa-solid fa-lightbulb" style={{ marginRight: 8, color: "var(--gold)" }} />AI Business Insights</h3>
            </div>
            <div className="card-body">
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                {data.insights.map((i) => (
                  <li key={i.id} style={{ fontSize: 13, lineHeight: 1.5 }}>{i.text}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><i className="fa-solid fa-clipboard-check" style={{ marginRight: 8, color: "var(--success)" }} />Recommendations</h3>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 10 }}>
              {data.recommendations.map((r) => {
                const content = <span style={{ fontSize: 13, lineHeight: 1.5 }}>{r.text}</span>;
                return r.href ? (
                  <Link key={r.id} href={r.href} style={{ display: "block", color: "var(--primary)", textDecoration: "none" }}>
                    <i className="fa-solid fa-arrow-right" style={{ marginRight: 8, fontSize: 11 }} />{content}
                  </Link>
                ) : (
                  <div key={r.id}><i className="fa-solid fa-circle" style={{ marginRight: 8, fontSize: 6, verticalAlign: "middle" }} />{content}</div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        {/* Upcoming events */}
        {data.upcomingEvents.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><i className="fa-solid fa-calendar-check" style={{ marginRight: 8, color: "var(--primary)" }} />Upcoming Events</h3>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 10 }}>
              {data.upcomingEvents.map((e) => {
                const body = (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.detail}</div>
                    </div>
                    {e.href && <i className="fa-solid fa-chevron-right" style={{ color: "var(--text-muted)", alignSelf: "center" }} />}
                  </div>
                );
                return e.href ? (
                  <Link key={e.id} href={e.href} style={{ textDecoration: "none", color: "inherit" }}>{body}</Link>
                ) : (
                  <div key={e.id}>{body}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* Forecasts */}
        {data.forecasts.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title"><i className="fa-solid fa-chart-line" style={{ marginRight: 8, color: "#1565C0" }} />Smart Forecasts</h3>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 12 }}>
              {data.forecasts.map((f) => (
                <div key={f.id} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--cream-dark, #f7f2ea)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>
                    {f.format === "inr" ? `₹${formatInr(f.value)}` : formatInr(f.value)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.basis}</div>
                  <div style={{ fontSize: 10, fontStyle: "italic", color: "var(--text-muted)", marginTop: 4 }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: 4 }} />{f.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trend */}
      {data.trend.values.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title"><i className="fa-solid fa-chart-column" style={{ marginRight: 8 }} />Monthly Booking Trend</h3>
          </div>
          <div className="card-body">
            <FinanceChart type="bar" labels={data.trend.labels} values={data.trend.values} title="Monthly booking value" height={220} />
          </div>
        </div>
      )}

      {/* Follow-up questions */}
      {data.followUps.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><i className="fa-solid fa-comments" style={{ marginRight: 8 }} />Ask a follow-up</h3>
          </div>
          <div className="card-body" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {data.followUps.map((q) => (
              <Link
                key={q.id}
                href={q.href}
                className="btn btn-outline btn-sm"
                style={{ borderRadius: 20 }}
              >
                {q.text}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
