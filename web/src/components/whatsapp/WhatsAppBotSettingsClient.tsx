"use client";

import { useEffect, useState } from "react";

type Settings = {
  shopName: string;
  address: string;
  hours: string;
  phone: string;
  greetingReply: string;
  priceReply: string;
  rentalProcessReply: string;
  securityAdvanceReply: string;
  handoverReply: string;
  bookingCompleteReply: string;
  botEnabled: boolean;
  flowEnabled: boolean;
};

export default function WhatsAppBotSettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/whatsapp/bot-settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { settings: Settings };
        setSettings(data.settings);
      })
      .catch(() => setMessage("Failed to load settings"));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/whatsapp/bot-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await res.json()) as { error?: string; settings?: Settings };
      if (!res.ok) {
        setMessage(data.error || "Save failed");
        return;
      }
      if (data.settings) setSettings(data.settings);
      setMessage("Saved successfully.");
    } catch {
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div style={{ padding: 24 }}>Loading WhatsApp bot settings…</div>;
  }

  const field = (
    label: string,
    key: keyof Settings,
    multiline = false,
  ) => (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{label}</div>
      {multiline ? (
        <textarea
          value={String(settings[key] ?? "")}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          rows={4}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
      ) : (
        <input
          value={String(settings[key] ?? "")}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
      )}
    </label>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>WhatsApp Bot Settings</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
        Owner-only. Env vars still apply as fallbacks when a field is empty in the database.
      </p>

      {field("Shop name", "shopName")}
      {field("Address", "address", true)}
      {field("Timings", "hours")}
      {field("Contact phone", "phone")}
      {field("Greeting reply", "greetingReply", true)}
      {field("Price reply", "priceReply", true)}
      {field("Rental process reply", "rentalProcessReply", true)}
      {field("Security / advance reply", "securityAdvanceReply", true)}
      {field("Handover reply", "handoverReply", true)}
      {field("Booking complete reply", "bookingCompleteReply", true)}

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={settings.botEnabled}
          onChange={(e) => setSettings({ ...settings, botEnabled: e.target.checked })}
        />
        Bot enabled
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={settings.flowEnabled}
          onChange={(e) => setSettings({ ...settings, flowEnabled: e.target.checked })}
        />
        Booking flow enabled
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        style={{
          background: "#16a34a",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 20px",
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
      {message && <p style={{ marginTop: 12, fontSize: 13, color: message.includes("Failed") ? "#dc2626" : "#047857" }}>{message}</p>}
    </div>
  );
}
