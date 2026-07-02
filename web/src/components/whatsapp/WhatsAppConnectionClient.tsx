"use client";

import { useState } from "react";

type TestResult = {
  ok?: boolean;
  stage?: string;
  message?: string;
  summary?: string;
  envCheck?: Record<string, string>;
  appCheck?: { ok: boolean; appId?: string; name?: string; error?: string };
  metaApiCheck?: {
    ok: boolean;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    error?: string;
  };
  businessCheck?: { ok: boolean; name?: string; error?: string };
  nextSteps?: string[];
};

export default function WhatsAppConnectionClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/whatsapp/test-connection", { credentials: "same-origin" });
      const data = (await res.json()) as TestResult;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        summary: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <i className="fa-brands fa-whatsapp" style={{ fontSize: 28, color: "#25d366" }} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Meta WhatsApp Connection</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            App ID <code>1937024637016610</code> — verify credentials and API access
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Required in <code>web/.env.local</code></h3>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#374151", paddingLeft: 20 }}>
            <li><code>META_APP_ID</code> — 1937024637016610 (set)</li>
            <li><code>WHATSAPP_ACCESS_TOKEN</code> — permanent system user token</li>
            <li><code>WHATSAPP_PHONE_NUMBER_ID</code> — from WhatsApp → API Setup</li>
            <li><code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> — WABA ID</li>
            <li><code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> — your webhook secret</li>
          </ul>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 0 }}>
            After editing <code>.env.local</code>, restart <code>npm run dev</code>.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={runTest}
        disabled={loading}
        style={{ marginBottom: 24 }}
      >
        {loading ? (
          <>
            <span className="spinner spinner-inline" /> Testing connection…
          </>
        ) : (
          <>
            <i className="fa-solid fa-plug" style={{ marginRight: 8 }} />
            Test Meta Connection
          </>
        )}
      </button>

      {result && (
        <div
          className="card"
          style={{
            borderColor: result.ok ? "#16a34a" : "#dc2626",
            borderWidth: 2,
          }}
        >
          <div className="card-body">
            <p style={{ fontWeight: 700, fontSize: 15, marginTop: 0 }}>
              {result.summary || result.message || (result.ok ? "Connected" : "Failed")}
            </p>

            {result.envCheck && (
              <>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Environment</h4>
                <pre
                  style={{
                    fontSize: 12,
                    background: "#f9fafb",
                    padding: 12,
                    borderRadius: 8,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(result.envCheck, null, 2)}
                </pre>
              </>
            )}

            {result.appCheck && (
              <p style={{ fontSize: 13 }}>
                <strong>Meta App:</strong>{" "}
                {result.appCheck.ok
                  ? `✅ ${result.appCheck.name || result.appCheck.appId}`
                  : `❌ ${result.appCheck.error}`}
              </p>
            )}

            {result.metaApiCheck && (
              <p style={{ fontSize: 13 }}>
                <strong>Phone number:</strong>{" "}
                {result.metaApiCheck.ok
                  ? `✅ ${result.metaApiCheck.displayPhoneNumber} (${result.metaApiCheck.verifiedName})`
                  : `❌ ${result.metaApiCheck.error}`}
              </p>
            )}

            {result.businessCheck && (
              <p style={{ fontSize: 13 }}>
                <strong>Business account:</strong>{" "}
                {result.businessCheck.ok
                  ? `✅ ${result.businessCheck.name}`
                  : `❌ ${result.businessCheck.error}`}
              </p>
            )}

            {result.nextSteps && result.nextSteps.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Next steps</h4>
                <ul style={{ fontSize: 13, paddingLeft: 20 }}>
                  {result.nextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body">
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Webhook (production / ngrok)</h3>
          <p style={{ fontSize: 13, color: "#374151" }}>
            Callback URL: <code>https://YOUR-DOMAIN/api/whatsapp/webhook</code>
          </p>
          <p style={{ fontSize: 13, color: "#374151" }}>
            Verify token: same as <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> in <code>.env.local</code>
          </p>
        </div>
      </div>
    </div>
  );
}
