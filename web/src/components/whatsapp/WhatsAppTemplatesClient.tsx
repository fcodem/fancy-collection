"use client";

import { useEffect, useState } from "react";
import { isTransientNetworkError } from "@/lib/fetchJson";

type Template = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
};

type MetaTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  text?: string;
  format?: "TEXT";
  buttons?: Array<{ type: "QUICK_REPLY"; text: string } | { type: "URL"; text: string; url: string }>;
};

const EMPTY_FORM = {
  name: "",
  language: "en",
  category: "UTILITY" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
  headerText: "",
  bodyText: "",
  footerText: "",
  button1: "",
  button2: "",
  button3: "",
};

function buildMetaComponents(form: typeof EMPTY_FORM): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [];
  if (form.headerText.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: form.headerText.trim() });
  }
  components.push({ type: "BODY", text: form.bodyText.trim() });
  if (form.footerText.trim()) {
    components.push({ type: "FOOTER", text: form.footerText.trim() });
  }
  const buttons = [form.button1, form.button2, form.button3]
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ type: "QUICK_REPLY" as const, text }));
  if (buttons.length > 0) {
    components.push({ type: "BUTTONS", buttons });
  }
  return components;
}

export default function WhatsAppTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json() as { templates?: Template[]; error?: string };
      setTemplates(data.templates || []);
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statusIcon = (status: string) => {
    if (status === "APPROVED") return <i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 13 }} />;
    if (status === "PENDING") return <i className="fa-solid fa-clock" style={{ color: "#d97706", fontSize: 13 }} />;
    return <i className="fa-solid fa-circle-xmark" style={{ color: "#ef4444", fontSize: 13 }} />;
  };

  const submitTemplate = async () => {
    if (!form.name.trim() || !form.bodyText.trim()) {
      alert("Template name and body text are required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim().toLowerCase(),
        language: form.language,
        category: form.category,
        components: buildMetaComponents(form),
      };
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { ok?: boolean; error?: string; template?: { status: string } };
      if (data.ok) {
        alert(`Template submitted to Meta. Status: ${data.template?.status || "PENDING"}. Approval may take up to 24 hours.`);
        setForm(EMPTY_FORM);
        setShowForm(false);
        load();
      } else {
        alert(data.error || "Failed to create template");
      }
    } catch {
      alert("Failed to create template");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTemplate = async (name: string) => {
    if (!confirm(`Delete template "${name}" from Meta? This cannot be undone.`)) return;
    setDeleting(name);
    try {
      const res = await fetch(`/api/whatsapp/templates?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setTemplates((prev) => prev.filter((t) => t.name !== name));
      } else {
        alert(data.error || "Delete failed");
      }
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(null);
    }
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: "#16a34a" }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", margin: 0 }}>Message Templates</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>
              Templates approved by Meta for sending outside the 24-hour window
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: showForm ? "#fff" : "#2563eb",
              color: showForm ? "#2563eb" : "#fff",
              border: showForm ? "1px solid #bfdbfe" : "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <i className={`fa-solid ${showForm ? "fa-xmark" : "fa-plus"}`} style={{ fontSize: 12 }} />
            {showForm ? "Cancel" : "Add Template"}
          </button>
          <button
            onClick={load}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 12 }} />
            Refresh from Meta
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 4px 0" }}>Create Meta Template</h2>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 16px 0" }}>
            Submitted in Meta Graph API format. Use {"{{1}}"}, {"{{2}}"} for variable placeholders in body text.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                placeholder="booking_reminder"
                style={inputStyle}
              />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>lowercase, underscores only</span>
            </div>
            <div>
              <label style={labelStyle}>Language</label>
              <select
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                style={inputStyle}
              >
                <option value="en">en</option>
                <option value="en_US">en_US</option>
                <option value="en_IN">en_IN</option>
                <option value="hi">hi</option>
                <option value="mr">mr</option>
                <option value="gu">gu</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}
                style={inputStyle}
              >
                <option value="UTILITY">UTILITY</option>
                <option value="MARKETING">MARKETING</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Header (optional, TEXT)</label>
            <input
              value={form.headerText}
              onChange={(e) => setForm((f) => ({ ...f, headerText: e.target.value }))}
              placeholder="Team Fancy Collection"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Body *</label>
            <textarea
              value={form.bodyText}
              onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
              placeholder="Hello {{1}}, your return is due on {{2}}. Thank you for choosing us."
              rows={4}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Footer (optional)</label>
            <input
              value={form.footerText}
              onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
              placeholder="Fancy Collection · Rajkot"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Quick reply button 1</label>
              <input
                value={form.button1}
                onChange={(e) => setForm((f) => ({ ...f, button1: e.target.value }))}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Quick reply button 2</label>
              <input
                value={form.button2}
                onChange={(e) => setForm((f) => ({ ...f, button2: e.target.value }))}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Quick reply button 3</label>
              <input
                value={form.button3}
                onChange={(e) => setForm((f) => ({ ...f, button3: e.target.value }))}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
          </div>

          <button
            onClick={submitTemplate}
            disabled={submitting}
            style={{
              background: submitting ? "#d1d5db" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting to Meta..." : "Submit to Meta for Approval"}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>Loading templates...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb" }}>
          <i className="fa-solid fa-file-lines" style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No templates found</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Click Add Template to create one in Meta format</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "#1f2937" }}>{t.name}</span>
                    <span style={{ fontSize: 11, background: "#f3f4f6", color: "#4b5563", padding: "2px 8px", borderRadius: 20 }}>{t.category}</span>
                    <span style={{ fontSize: 11, background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 20 }}>{t.language}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                    {statusIcon(t.status)}
                    {t.status}
                  </div>
                </div>
                <button
                  onClick={() => deleteTemplate(t.name)}
                  disabled={deleting === t.name}
                  style={{
                    fontSize: 12,
                    background: "#fff",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: deleting === t.name ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
                  {deleting === t.name ? "Deleting..." : "Delete"}
                </button>
              </div>

              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {t.components.map((c, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {c.type}{c.format ? ` (${c.format})` : ""}
                    </div>
                    {c.text && (
                      <div style={{ marginTop: 4, color: "#374151", whiteSpace: "pre-wrap", background: "#f9fafb", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                        {c.text}
                      </div>
                    )}
                    {c.buttons && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        {c.buttons.map((btn, j) => (
                          <span key={j} style={{ fontSize: 12, background: "#eff6ff", color: "#2563eb", padding: "4px 8px", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                            [{btn.type}] {btn.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
