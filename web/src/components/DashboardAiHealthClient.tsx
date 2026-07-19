"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AiHealth = { queued: number; failed: number };

export default function DashboardAiHealthClient() {
  const [data, setData] = useState<AiHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/dashboard/ai-health", { credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as AiHealth & { error?: string };
        if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card mb-24">
      <div className="card-header">
        <h3 className="card-title">AI Indexing Health</h3>
      </div>
      <div className="card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {error ? (
          <span style={{ color: "var(--text-muted)" }}>{error}</span>
        ) : data ? (
          <>
            <span>
              <strong>{data.queued}</strong> queued/processing
            </span>
            <span>
              <strong>{data.failed}</strong> failed
            </span>
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Loading AI queue…</span>
        )}
        <Link href="/admin/image-sync" className="btn btn-outline btn-sm">
          Open AI Jobs
        </Link>
      </div>
    </div>
  );
}
