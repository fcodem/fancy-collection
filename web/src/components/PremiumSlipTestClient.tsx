"use client";

import { useState } from "react";

type SlipKind = "booking" | "delivery" | "return" | "incomplete";

type RenderResult = {
  kind: SlipKind;
  ok: boolean;
  templateVersion?: string;
  pdfSizeBytes?: number;
  pageCount?: number;
  totalMs?: number;
  failureStage?: string;
  retryable?: boolean;
  error?: string;
  downloadToken?: string;
  rootId?: string;
};

type SendResult = {
  ok: boolean;
  metaRequestStarted?: boolean;
  messageId?: string;
  method?: string;
  recipientMasked?: string;
  sentAt?: string;
  error?: string;
};

export default function PremiumSlipTestClient() {
  const [bookingId, setBookingId] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<SlipKind, RenderResult | undefined>>({
    booking: undefined,
    delivery: undefined,
    return: undefined,
    incomplete: undefined,
  });
  const [sendResults, setSendResults] = useState<Record<SlipKind, SendResult | undefined>>({
    booking: undefined,
    delivery: undefined,
    return: undefined,
    incomplete: undefined,
  });

  async function renderKind(kind: SlipKind | "all") {
    setLoading(kind);
    try {
      const res = await fetch("/api/admin/test-all-premium-slips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          bookingId: bookingId ? Number(bookingId) : undefined,
          runId: runId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");

      if (kind === "all" && Array.isArray(data.results)) {
        setRunId(data.runId);
        const next = { ...results };
        for (const row of data.results as Array<{ render: RenderResult; runId: string }>) {
          next[row.render.kind] = row.render;
        }
        setResults(next);
      } else {
        setRunId(data.runId);
        setResults((prev) => ({ ...prev, [data.render.kind]: data.render }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Render failed");
    } finally {
      setLoading(null);
    }
  }

  async function sendKind(kind: SlipKind) {
    if (!testPhone.trim()) {
      alert("Enter an approved WhatsApp test number — never uses the booking customer number.");
      return;
    }
    if (!runId) {
      alert("Render the slip first.");
      return;
    }
    const render = results[kind];
    if (!render?.ok) {
      alert("Rendering must succeed before sending.");
      return;
    }

    setLoading(`send-${kind}`);
    try {
      const res = await fetch("/api/admin/test-all-premium-slips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          runId,
          testPhone,
          sendToTest: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSendResults((prev) => ({ ...prev, [kind]: data.send }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Send failed");
    } finally {
      setLoading(null);
    }
  }

  function renderRow(kind: SlipKind, label: string) {
    const r = results[kind];
    const s = sendResults[kind];
    return (
      <div
        key={kind}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: "0 0 8px" }}>{label}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" disabled={loading !== null} onClick={() => renderKind(kind)}>
            {loading === kind ? "Rendering…" : "Render"}
          </button>
          {r?.ok && r.downloadToken ? (
            <a
              href={`/api/admin/test-all-premium-slips?download=${encodeURIComponent(r.downloadToken)}`}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          ) : null}
          <button
            type="button"
            disabled={loading !== null || !r?.ok}
            onClick={() => sendKind(kind)}
          >
            {loading === `send-${kind}` ? "Sending…" : "Send to approved test number"}
          </button>
        </div>
        {r ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            <li>Status: {r.ok ? "Success" : "Failed"}</li>
            {r.templateVersion ? <li>Template: {r.templateVersion}</li> : null}
            {r.rootId ? <li>Root: #{r.rootId}</li> : null}
            {r.pdfSizeBytes != null ? <li>PDF size: {r.pdfSizeBytes} bytes</li> : null}
            {r.pageCount != null ? <li>Pages: {r.pageCount}</li> : null}
            {r.totalMs != null ? <li>Total: {r.totalMs} ms</li> : null}
            {r.failureStage ? <li>Failure stage: {r.failureStage}</li> : null}
            {r.retryable != null ? <li>Retryable: {String(r.retryable)}</li> : null}
            {r.error ? <li style={{ color: "#b00020" }}>{r.error}</li> : null}
          </ul>
        ) : (
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>Not tested yet.</p>
        )}
        {s ? (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
            <li>Meta send: {s.ok ? "Confirmed" : "Failed"}</li>
            {s.recipientMasked ? <li>Recipient: {s.recipientMasked}</li> : null}
            {s.messageId ? <li>Message ID: {s.messageId}</li> : null}
            {s.method ? <li>Method: {s.method}</li> : null}
            {s.error ? <li style={{ color: "#b00020" }}>{s.error}</li> : null}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gap: 12, maxWidth: 560, marginBottom: 20 }}>
        <label>
          Booking ID (optional — uses latest SLIP TEST booking when empty)
          <input
            type="number"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            placeholder="e.g. 1234"
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label>
          Approved WhatsApp test number (manual entry only — never the customer number)
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="10-digit mobile"
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => renderKind("all")}
          style={{ fontWeight: 700 }}
        >
          {loading === "all" ? "Rendering all four…" : "Render All Four"}
        </button>
        {runId ? (
          <span style={{ marginLeft: 12, fontSize: 13, color: "#666" }}>Run: {runId}</span>
        ) : null}
      </div>

      {renderRow("booking", "Booking Slip")}
      {renderRow("delivery", "Delivery Slip")}
      {renderRow("return", "Return Slip")}
      {renderRow("incomplete", "Incomplete Return Slip")}
    </div>
  );
}
