"use client";

import { useEffect, useState } from "react";
import { isTransientNetworkError } from "@/lib/fetchJson";

type Template = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{ type: string; text?: string }>;
};

type Broadcast = {
  id: number;
  name: string;
  templateName: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
};

export default function WhatsAppBroadcastClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    broadcastName: "",
    templateName: "",
    templateLanguage: "en",
    recipientType: "all_customers" as "all_customers" | "pending_returns" | "custom_phones",
    customPhones: "",
  });

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json() as { templates?: Template[] };
      setTemplates((data.templates || []).filter((t) => t.status === "APPROVED"));
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadBroadcasts = async () => {
    try {
      const res = await fetch("/api/whatsapp/broadcast");
      const data = await res.json() as { broadcasts?: Broadcast[] };
      setBroadcasts(data.broadcasts || []);
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    }
  };

  useEffect(() => {
    loadTemplates();
    loadBroadcasts();
  }, []);

  const handleSend = async () => {
    if (!form.broadcastName || !form.templateName) {
      alert("Please fill in broadcast name and select a template.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customPhones: form.customPhones
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json() as { ok?: boolean; totalRecipients?: number; error?: string };
      if (data.ok) {
        alert(`Broadcast started! Sending to ${data.totalRecipients} recipients.`);
        setForm({ broadcastName: "", templateName: "", templateLanguage: "en", recipientType: "all_customers", customPhones: "" });
        loadBroadcasts();
      } else {
        alert(data.error || "Failed to send broadcast");
      }
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
      alert("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.name === form.templateName);

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    padding: 24,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginTop: 4,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: "#4b5563",
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <i className="fa-solid fa-bullhorn" style={{ fontSize: 24, color: "#16a34a" }} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", margin: 0 }}>Broadcast Messages</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>Send approved templates to your customers</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Compose Panel */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 16px 0" }}>New Broadcast</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Broadcast Name</label>
            <input
              value={form.broadcastName}
              onChange={(e) => setForm((f) => ({ ...f, broadcastName: e.target.value }))}
              placeholder="e.g. Eid Collection Launch"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={labelStyle}>Template</label>
              <button
                onClick={loadTemplates}
                style={{ fontSize: 12, color: "#16a34a", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 11 }} /> Refresh
              </button>
            </div>
            {loadingTemplates ? (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading templates...</div>
            ) : (
              <select
                value={form.templateName}
                onChange={(e) => setForm((f) => ({ ...f, templateName: e.target.value }))}
                style={inputStyle}
              >
                <option value="">Select approved template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                ))}
              </select>
            )}
          </div>

          {selectedTemplate && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: "#15803d", marginBottom: 4 }}>Preview:</div>
              {selectedTemplate.components.filter((c) => c.type === "BODY").map((c, i) => (
                <p key={i} style={{ margin: 0, color: "#374151", whiteSpace: "pre-wrap" }}>{c.text}</p>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Recipients</label>
            <select
              value={form.recipientType}
              onChange={(e) => setForm((f) => ({ ...f, recipientType: e.target.value as "all_customers" | "pending_returns" | "custom_phones" }))}
              style={inputStyle}
            >
              <option value="all_customers">All Customers (from bookings)</option>
              <option value="pending_returns">Pending Returns (next 7 days)</option>
              <option value="custom_phones">Custom Phone Numbers</option>
            </select>
          </div>

          {form.recipientType === "custom_phones" && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Phone Numbers (one per line, with country code)</label>
              <textarea
                value={form.customPhones}
                onChange={(e) => setForm((f) => ({ ...f, customPhones: e.target.value }))}
                placeholder={"+919876543210\n+919123456789"}
                rows={4}
                style={{ ...inputStyle, resize: "none", fontFamily: "monospace" }}
              />
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              width: "100%",
              background: sending ? "#d1d5db" : "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 0",
              fontWeight: 600,
              fontSize: 14,
              cursor: sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <i className="fa-solid fa-paper-plane" />
            {sending ? "Sending..." : "Send Broadcast"}
          </button>
        </div>

        {/* Broadcast History */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: 0 }}>Broadcast History</h2>
            <button
              onClick={loadBroadcasts}
              style={{ fontSize: 12, color: "#16a34a", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 11 }} /> Refresh
            </button>
          </div>

          {broadcasts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>No broadcasts sent yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {broadcasts.map((b) => (
                <BroadcastCard key={b.id} broadcast={b} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BroadcastCard({ broadcast: b }: { broadcast: Broadcast }) {
  const statusIcon =
    b.status === "completed"
      ? <i className="fa-solid fa-circle-check" style={{ color: "#16a34a" }} />
      : b.status === "sending"
      ? <i className="fa-solid fa-clock" style={{ color: "#d97706" }} />
      : <i className="fa-solid fa-circle-xmark" style={{ color: "#ef4444" }} />;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13, color: "#1f2937" }}>{b.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Template: {b.templateName}</div>
        </div>
        {statusIcon}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#4b5563" }}>
        <span><i className="fa-solid fa-users" style={{ marginRight: 4, fontSize: 10 }} />{b.totalCount} recipients</span>
        <span style={{ color: "#16a34a" }}>✓ {b.sentCount} sent</span>
        {b.failedCount > 0 && <span style={{ color: "#ef4444" }}>✗ {b.failedCount} failed</span>}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
        {new Date(b.createdAt).toLocaleString("en-IN")}
      </div>
    </div>
  );
}
