"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type Settings = {
  openaiApiKeyMasked?: string;
  visionModel: string;
  embeddingModel: string;
  enhancementModel: string;
  enhancementQuality: "low" | "medium" | "high";
  enhancementSize: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  concurrency: number;
  retryCount: number;
  timeoutMs: number;
  fallbackBehavior: "original" | "error";
};

const DEFAULTS: Settings = {
  openaiApiKeyMasked: "",
  visionModel: "gpt-4.1-mini",
  embeddingModel: "text-embedding-3-large",
  enhancementModel: "gpt-image-1",
  enhancementQuality: "high",
  enhancementSize: "1024x1536", // portrait — best for full-length Indian garments
  concurrency: 2,
  retryCount: 2,
  timeoutMs: 90000,
  fallbackBehavior: "original",
};

export default function AiSettingsClient() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<{ settings: Settings; hasApiKey?: boolean }>("/api/admin/ai/settings");
        setSettings({ ...DEFAULTS, ...data.settings });
        setHasApiKey(!!data.hasApiKey);
      } catch {
        setStatus("Failed to load AI settings");
      }
    })();
  }, []);

  async function testKey() {
    setTesting(true);
    setStatus("");
    try {
      const data = await fetchJson<{ message: string }>("/api/admin/ai/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: openaiApiKey.trim() || undefined }),
      });
      setStatus(data.message || "API key is valid");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Key test failed");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!openaiApiKey.trim() && !hasApiKey) {
      setStatus("Paste your OpenAI API key (sk-...) before saving.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const data = await fetchJson<{ settings: Settings; hasApiKey?: boolean; queuedRetries?: number }>(
        "/api/admin/ai/settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...settings,
            openaiApiKey: openaiApiKey.trim() || undefined,
          }),
        },
      );
      setSettings({ ...DEFAULTS, ...data.settings });
      setHasApiKey(!!data.hasApiKey);
      setOpenaiApiKey("");
      const retryMsg =
        data.queuedRetries && data.queuedRetries > 0
          ? ` · Re-queued ${data.queuedRetries} failed enhancement(s)`
          : "";
      setStatus(`AI settings saved${retryMsg}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 900, padding: 20 }}>
      <h2 style={{ margin: 0, marginBottom: 12 }}>AI Settings</h2>
      <p style={{ marginTop: 0, color: "#666" }}>
        Configure OpenAI Vision, embedding, enhancement quality and queue behavior.
      </p>

      {!hasApiKey ? (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 8,
            background: "#fff4e5",
            border: "1px solid #f0c36d",
            color: "#7a4d00",
            fontSize: 14,
          }}
        >
          <strong>No OpenAI API key configured.</strong> Dress enhancement will not run until you paste a
          valid <code>sk-...</code> key below and click <strong>Test Key</strong> then <strong>Save Settings</strong>.
          Alternatively add <code>OPENAI_API_KEY=sk-...</code> to <code>web/.env.local</code> and restart the dev server.
        </div>
      ) : (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            color: "#1b5e20",
            fontSize: 14,
          }}
        >
          OpenAI API key is configured ({settings.openaiApiKeyMasked || "from environment"}).
        </div>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label>
          OpenAI API Key (new value)
          <input
            type="password"
            className="input"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            placeholder={settings.openaiApiKeyMasked ? settings.openaiApiKeyMasked : "sk-..."}
          />
        </label>
        <label>
          Vision Model
          <input
            className="input"
            value={settings.visionModel}
            onChange={(e) => setSettings((s) => ({ ...s, visionModel: e.target.value }))}
          />
        </label>
        <label>
          Embedding Model
          <input
            className="input"
            value={settings.embeddingModel}
            onChange={(e) => setSettings((s) => ({ ...s, embeddingModel: e.target.value }))}
          />
        </label>
        <label>
          Enhancement Model
          <input
            className="input"
            value={settings.enhancementModel}
            onChange={(e) => setSettings((s) => ({ ...s, enhancementModel: e.target.value }))}
          />
        </label>
        <label>
          Enhancement Quality
          <select
            className="input"
            value={settings.enhancementQuality}
            onChange={(e) =>
              setSettings((s) => ({ ...s, enhancementQuality: e.target.value as Settings["enhancementQuality"] }))
            }
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label>
          Image Size
          <select
            className="input"
            value={settings.enhancementSize}
            onChange={(e) =>
              setSettings((s) => ({ ...s, enhancementSize: e.target.value as Settings["enhancementSize"] }))
            }
          >
            <option value="auto">auto</option>
            <option value="1024x1024">1024x1024</option>
            <option value="1024x1536">1024x1536</option>
            <option value="1536x1024">1536x1024</option>
          </select>
        </label>
        <label>
          Concurrency
          <input
            type="number"
            className="input"
            value={settings.concurrency}
            onChange={(e) => setSettings((s) => ({ ...s, concurrency: Number(e.target.value) || 1 }))}
          />
        </label>
        <label>
          Retry Count
          <input
            type="number"
            className="input"
            value={settings.retryCount}
            onChange={(e) => setSettings((s) => ({ ...s, retryCount: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Timeout (ms)
          <input
            type="number"
            className="input"
            value={settings.timeoutMs}
            onChange={(e) => setSettings((s) => ({ ...s, timeoutMs: Number(e.target.value) || 30000 }))}
          />
        </label>
        <label>
          Fallback Behavior
          <select
            className="input"
            value={settings.fallbackBehavior}
            onChange={(e) =>
              setSettings((s) => ({ ...s, fallbackBehavior: e.target.value as Settings["fallbackBehavior"] }))
            }
          >
            <option value="original">Use original image</option>
            <option value="error">Show enhancement error</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-outline" onClick={testKey} disabled={testing || saving}>
          {testing ? "Testing..." : "Test Key"}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving || testing}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {status ? (
          <span style={{ color: status.toLowerCase().includes("valid") || status.includes("saved") ? "#157347" : "#b42318" }}>
            {status}
          </span>
        ) : null}
      </div>

      {/* Pipeline 2 status — auto-enhancement is paused; code kept for future use */}
      <div style={{ marginTop: 24, padding: "16px 18px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          Auto Image Enhancement — Paused
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#666" }}>
          Inventory currently saves the uploaded photo only and still collects AI metadata
          from that upload. Enhancement code is kept in the repo for later. To re-enable:
          set <code>AUTO_IMAGE_ENHANCEMENT_ENABLED = true</code> in{" "}
          <code>enhancementFeatureFlags.ts</code> or set <code>AI_AUTO_IMAGE_ENHANCEMENT=1</code>.
        </p>
        <button
          className="btn"
          style={{ padding: "8px 18px", background: "#94a3b8", color: "#fff", fontWeight: 600 }}
          disabled={resetting}
          onClick={async () => {
            if (!confirm("This only works when auto-enhancement is re-enabled. Continue?")) return;
            setResetting(true);
            setStatus("");
            try {
              const r = await fetchJson<{ ok: boolean; queued: number }>(
                "/api/admin/ai/enhancement/reset-all",
                { method: "POST" }
              );
              setStatus(`Queued ${r.queued} items for re-enhancement`);
            } catch (err) {
              setStatus(err instanceof Error ? err.message : "Reset failed");
            } finally {
              setResetting(false);
            }
          }}
        >
          {resetting ? "Checking…" : "Re-run All Enhancements (disabled while paused)"}
        </button>
      </div>
    </div>
  );
}
