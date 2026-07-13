"use client";

import { useState } from "react";

type TestResult = {
  ok?: boolean;
  stage?: string;
  message?: string;
  summary?: string;
  envCheck?: Record<string, string>;
  optionalEnvCheck?: Record<string, string>;
  appCheck?: {
    ok: boolean;
    optional?: boolean;
    appId?: string;
    name?: string;
    error?: string;
    note?: string;
  };
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
  const [newToken, setNewToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);

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

  async function replaceToken() {
    const token = newToken.trim();
    if (token.length < 40) {
      alert("Paste the full Meta WhatsApp access token first.");
      return;
    }
    if (
      !confirm(
        "Replace WHATSAPP_ACCESS_TOKEN in .env.local with this new token?\n\nThe old token will be overwritten.",
      )
    ) {
      return;
    }
    setSavingToken(true);
    setTokenMessage(null);
    try {
      const res = await fetch("/api/whatsapp/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accessToken: token }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        metaOk?: boolean;
        displayPhone?: string;
        metaError?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        alert(data.error || "Failed to save token");
        return;
      }
      setTokenMessage(data.message || "Token saved.");
      setNewToken("");
      if (data.metaOk) {
        await runTest();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save token");
    } finally {
      setSavingToken(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <i className="fa-brands fa-whatsapp" style={{ fontSize: 28, color: "#25d366" }} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Meta WhatsApp Connection</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            Verify credentials and replace the access token when Meta issues a new one
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <h3 style={{ fontSize: 15, marginTop: 0 }}>
            Required environment variables
          </h3>
          <p style={{ fontSize: 13, color: "#4b5563" }}>
            On <strong>Vercel</strong>, set these in{" "}
            <strong>Project → Settings → Environment Variables (Production)</strong>, then Redeploy.
            Locally, put them in <code>web/.env.local</code>.
          </p>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#374151", paddingLeft: 20 }}>
            <li>
              <code>META_APP_ID</code>
            </li>
            <li>
              <code>WHATSAPP_ACCESS_TOKEN</code> — permanent system user token (not a short-lived user token)
            </li>
            <li>
              <code>WHATSAPP_PHONE_NUMBER_ID</code> — from WhatsApp → API Setup
            </li>
            <li>
              <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> — WABA ID
            </li>
            <li>
              <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> — your webhook secret
            </li>
            <li>
              <code>BLOB_READ_WRITE_TOKEN</code> — required to attach PDF slips on Vercel
            </li>
          </ul>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 0 }}>
            Also ensure <code>WHATSAPP_RECEIPTS_DISABLED</code> is not set to <code>true</code>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, borderColor: "#fcd34d" }}>
        <div className="card-body">
          <h3 style={{ fontSize: 15, marginTop: 0 }}>
            <i className="fa-solid fa-key" style={{ marginRight: 8, color: "#b45309" }} />
            Replace WhatsApp access token
          </h3>
          <p style={{ fontSize: 13, color: "#4b5563" }}>
            Paste a new permanent System User token. On this live site it updates the current server
            instance immediately; you must also save it in Vercel Environment Variables and Redeploy
            so it survives restarts.
          </p>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#4b5563", display: "block" }}>
            New access token
          </label>
          <textarea
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder="EAA...."
            rows={3}
            style={{
              width: "100%",
              marginTop: 6,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: 10,
              fontFamily: "monospace",
              fontSize: 12,
              boxSizing: "border-box",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={replaceToken}
            disabled={savingToken || newToken.trim().length < 20}
            style={{ marginTop: 12 }}
          >
            {savingToken ? (
              <>
                <span className="spinner spinner-inline" /> Saving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 8 }} />
                Replace old token with new
              </>
            )}
          </button>
          {tokenMessage && (
            <p style={{ fontSize: 13, color: "#15803d", marginTop: 12, marginBottom: 0 }}>
              {tokenMessage}
            </p>
          )}
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
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Required environment</h4>
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

            {result.optionalEnvCheck && (
              <>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Optional (not required for WhatsApp send)</h4>
                <pre
                  style={{
                    fontSize: 12,
                    background: "#f9fafb",
                    padding: 12,
                    borderRadius: 8,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(result.optionalEnvCheck, null, 2)}
                </pre>
              </>
            )}

            {result.appCheck && (
              <p style={{ fontSize: 13 }}>
                <strong>Meta App ID:</strong>{" "}
                {result.appCheck.ok
                  ? `✅ ${result.appCheck.name || result.appCheck.appId}`
                  : `⚠️ ${result.appCheck.error}`}
                {result.appCheck.note ? (
                  <span style={{ display: "block", color: "#6b7280", marginTop: 4 }}>
                    {result.appCheck.note}
                  </span>
                ) : null}
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
