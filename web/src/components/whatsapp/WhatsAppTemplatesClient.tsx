"use client";

import { useEffect, useMemo, useState } from "react";
import { BRAND_FULL_NAME } from "@/lib/branding";
import { WHATSAPP_TEAM_LINE } from "@/lib/slipConstants";
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
  example?: { body_text?: string[][]; header_text?: string[] };
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
  exampleName: "Priya",
  exampleDetail: "15 July",
};

type FormState = typeof EMPTY_FORM;

const STARTER_PRESETS: Array<{
  id: string;
  label: string;
  apply: () => FormState;
}> = [
  {
    id: "welcome",
    label: "Customer welcome (Maps + Instagram)",
    apply: () => ({
      ...EMPTY_FORM,
      name: "customer_welcome_v1",
      category: "UTILITY",
      headerText: BRAND_FULL_NAME,
      bodyText:
        "Namaste! 🙏 We are delighted to connect with you.\n\n" +
        "Moradabad's trusted boutique for premium bridal & designer outfit rentals.\n\n" +
        "📞 For queries: 8077843874 • 8630834711\n\n" +
        "Use URL buttons: Shop Location (Google Maps) + View Dress Samples (Instagram).",
      footerText: "8077843874 • 8630834711",
      button1: "",
      exampleName: "Customer",
    }),
  },
  {
    id: "offer",
    label: "Festive offer (marketing)",
    apply: () => ({
      ...EMPTY_FORM,
      name: "festive_offer_custom",
      category: "MARKETING",
      headerText: BRAND_FULL_NAME,
      bodyText:
        "Dear {{1}},\n\nSpecial festive collection is now available for rent. Visit us soon for bridal & party wear.\n\n📞 For queries: 8077843874 / 8630834711",
      footerText: WHATSAPP_TEAM_LINE,
      button1: "Interested",
      exampleName: "Priya",
    }),
  },
  {
    id: "thanks",
    label: "Thank you (utility)",
    apply: () => ({
      ...EMPTY_FORM,
      name: "customer_thanks_note",
      category: "UTILITY",
      headerText: "Thank you",
      bodyText:
        "Dear {{1}},\n\nThank you for choosing Fancy Collection. We hope you had a wonderful experience.\n\n📞 For queries: 8077843874 / 8630834711",
      footerText: WHATSAPP_TEAM_LINE,
      exampleName: "Priya",
    }),
  },
  {
    id: "reminder",
    label: "Simple reminder (utility)",
    apply: () => ({
      ...EMPTY_FORM,
      name: "custom_reminder",
      category: "UTILITY",
      headerText: "Reminder",
      bodyText:
        "Dear {{1}},\n\nThis is a reminder regarding your booking. Please contact us if you need any help.\n\n📞 8077843874 / 8630834711",
      footerText: WHATSAPP_TEAM_LINE,
      exampleName: "Priya",
    }),
  },
];

function countBodyVars(text: string): number {
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  let max = 0;
  for (const m of matches) {
    const n = Number((m.match(/\d+/) || ["0"])[0]);
    if (n > max) max = n;
  }
  return max;
}

function validateBuilder(form: FormState): string | null {
  if (!form.name.trim()) return "Template name is required.";
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(form.name.trim())) {
    return "Name must start with a letter and use only lowercase letters, numbers, and underscores.";
  }
  if (!form.bodyText.trim()) return "Body text is required.";
  const body = form.bodyText.trim();
  if (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}$/.test(body)) {
    return "Meta rejects templates that start or end with a variable. Add plain text around {{1}}.";
  }
  const vars = countBodyVars(body);
  if (vars >= 1 && !form.exampleName.trim()) {
    return "Provide an example value for {{1}} (Meta requires sample values for variables).";
  }
  if (vars >= 2 && !form.exampleDetail.trim()) {
    return "Provide an example value for {{2}}.";
  }
  return null;
}

function buildMetaComponents(form: FormState): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [];
  if (form.headerText.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: form.headerText.trim() });
  }

  const body: MetaTemplateComponent = { type: "BODY", text: form.bodyText.trim() };
  const varCount = countBodyVars(form.bodyText);
  if (varCount > 0) {
    const samples = [form.exampleName.trim() || "Customer"];
    if (varCount >= 2) samples.push(form.exampleDetail.trim() || "Sample");
    while (samples.length < varCount) samples.push(`Sample${samples.length + 1}`);
    body.example = { body_text: [samples] };
  }
  components.push(body);

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

function previewBody(form: FormState): string {
  return form.bodyText
    .replace(/\{\{\s*1\s*\}\}/g, form.exampleName.trim() || "Priya")
    .replace(/\{\{\s*2\s*\}\}/g, form.exampleDetail.trim() || "15 July")
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => `Sample${n}`);
}

export default function WhatsAppTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ensuringBookingBill, setEnsuringBookingBill] = useState(false);
  const [ensuringWelcome, setEnsuringWelcome] = useState(false);
  const [ensuringAll, setEnsuringAll] = useState(false);
  const [cleaningLegacy, setCleaningLegacy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = (await res.json()) as { templates?: Template[]; error?: string };
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

  const builderError = useMemo(() => (showForm ? validateBuilder(form) : null), [showForm, form]);

  const ensureBookingBillTemplate = async () => {
    setEnsuringBookingBill(true);
    try {
      const res = await fetch("/api/whatsapp/templates/booking-bill", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        name?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        alert(data.error || "Failed to submit booking confirmation template");
        return;
      }
      alert(
        data.message ||
          `Template "${data.name}" status: ${data.status || "PENDING"}. Meta approval may take up to 24 hours.`,
      );
      await load();
    } catch (e) {
      if (!isTransientNetworkError(e)) alert("Failed to submit booking confirmation template");
    } finally {
      setEnsuringBookingBill(false);
    }
  };

  const ensureWelcomeTemplate = async () => {
    setEnsuringWelcome(true);
    try {
      const res = await fetch("/api/whatsapp/templates/welcome", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        name?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        alert(data.error || "Failed to submit customer welcome template");
        return;
      }
      alert(
        data.message ||
          `Template "${data.name}" status: ${data.status || "PENDING"}. Meta approval may take 24–48 hours.`,
      );
      await load();
    } catch (e) {
      if (!isTransientNetworkError(e)) alert("Failed to submit customer welcome template");
    } finally {
      setEnsuringWelcome(false);
    }
  };

  const ensureAllTemplates = async () => {
    setEnsuringAll(true);
    try {
      const res = await fetch("/api/whatsapp/templates/ensure-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeMarketing: true }),
      });
      const data = (await res.json()) as {
        error?: string;
        slips?: Array<{
          name: string;
          ok: boolean;
          status?: string | null;
          skipped?: boolean;
          error?: string;
        }>;
        booking_confirmation?: { name?: string; status?: string; ok?: boolean };
        customer_welcome?: { name?: string; status?: string; ok?: boolean; message?: string };
      };
      if (!res.ok || data.error) {
        alert(data.error || "Failed to submit templates");
        return;
      }
      const lines = [
        `booking_confirmation: ${data.booking_confirmation?.status || (data.booking_confirmation?.ok ? "ok" : "failed")}`,
        `customer_welcome: ${data.customer_welcome?.status || data.customer_welcome?.message || (data.customer_welcome?.ok ? "ok" : "failed")}`,
        ...(data.slips || []).map(
          (s) =>
            `${s.name}: ${s.ok ? s.status || (s.skipped ? "exists" : "submitted") : s.error || "failed"}`,
        ),
      ];
      alert(
        "Submitted to Meta (wait for APPROVED / Active):\n\n" +
          lines.join("\n") +
          "\n\nRefresh Meta Message templates after a few minutes.",
      );
      await load();
    } catch (e) {
      if (!isTransientNetworkError(e)) alert("Failed to submit all templates");
    } finally {
      setEnsuringAll(false);
    }
  };

  const cleanupLegacyTemplates = async () => {
    if (
      !confirm(
        "Delete obsolete WhatsApp templates from Meta (old URL / v1 / v2 slip names)?\n\nCurrent *_v3 and marketing templates are kept.",
      )
    ) {
      return;
    }
    setCleaningLegacy(true);
    try {
      const dry = await fetch("/api/whatsapp/templates/cleanup-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const dryData = (await dry.json()) as {
        wouldDelete?: string[];
        error?: string;
      };
      if (!dry.ok || dryData.error) {
        alert(dryData.error || "Could not preview obsolete templates");
        return;
      }
      const list = dryData.wouldDelete || [];
      if (list.length === 0) {
        alert("No obsolete templates found on Meta. Nothing to delete.");
        await load();
        return;
      }
      if (!confirm(`Will delete ${list.length} template(s):\n\n${list.join("\n")}\n\nContinue?`)) {
        return;
      }
      const res = await fetch("/api/whatsapp/templates/cleanup-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = (await res.json()) as {
        deleted?: string[];
        failed?: Array<{ name: string; error?: string }>;
        error?: string;
      };
      if (!res.ok || data.error) {
        alert(data.error || "Cleanup failed");
        return;
      }
      const failed = data.failed || [];
      alert(
        `Deleted: ${(data.deleted || []).join(", ") || "(none)"}\n` +
          (failed.length
            ? `Failed (Meta cooldown / policy):\n${failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`
            : "All selected obsolete templates removed."),
      );
      await load();
    } catch (e) {
      if (!isTransientNetworkError(e)) alert("Cleanup failed");
    } finally {
      setCleaningLegacy(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === "APPROVED")
      return <i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 13 }} />;
    if (status === "PENDING")
      return <i className="fa-solid fa-clock" style={{ color: "#d97706", fontSize: 13 }} />;
    return <i className="fa-solid fa-circle-xmark" style={{ color: "#ef4444", fontSize: 13 }} />;
  };

  const submitTemplate = async () => {
    const err = validateBuilder(form);
    if (err) {
      alert(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim().toLowerCase(),
        language: form.language,
        category: form.category,
        components: buildMetaComponents(form),
        allowCategoryChange: true,
      };
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        template?: { status: string; name?: string };
      };
      if (data.ok) {
        alert(
          `Template "${data.template?.name || form.name}" submitted to Meta for verification.\n\nStatus: ${data.template?.status || "PENDING"}\n\nApproval usually takes minutes to 24 hours. Refresh this page to see status.`,
        );
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
      const data = (await res.json()) as { ok?: boolean; error?: string };
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

  const insertVar = (n: 1 | 2) => {
    setForm((f) => ({ ...f, bodyText: `${f.bodyText}{{${n}}}` }));
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: "#16a34a" }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", margin: 0 }}>
              Message Templates
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>
              Build a template, submit it to Meta for verification, and manage approvals. Active slips use{" "}
              <code>*_v3</code>.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={cleanupLegacyTemplates}
            disabled={cleaningLegacy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              color: "#b45309",
              border: "1px solid #fcd34d",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: cleaningLegacy ? "wait" : "pointer",
              fontWeight: 500,
              opacity: cleaningLegacy ? 0.7 : 1,
            }}
            title="Remove old URL / v1 / v2 templates no longer used by the app"
          >
            <i className="fa-solid fa-broom" style={{ fontSize: 12 }} />
            {cleaningLegacy ? "Cleaning…" : "Remove obsolete templates"}
          </button>
          <button
            type="button"
            onClick={ensureAllTemplates}
            disabled={ensuringAll}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: ensuringAll ? "wait" : "pointer",
              fontWeight: 500,
              opacity: ensuringAll ? 0.7 : 1,
            }}
          >
            <i className="fa-solid fa-layer-group" style={{ fontSize: 12 }} />
            {ensuringAll ? "Submitting…" : "Submit all slip + marketing templates"}
          </button>
          <button
            type="button"
            onClick={ensureBookingBillTemplate}
            disabled={ensuringBookingBill}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0f766e",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: ensuringBookingBill ? "wait" : "pointer",
              fontWeight: 500,
              opacity: ensuringBookingBill ? 0.7 : 1,
            }}
          >
            <i className="fa-solid fa-file-pdf" style={{ fontSize: 12 }} />
            {ensuringBookingBill ? "Submitting…" : "Submit booking bill template"}
          </button>
          <button
            type="button"
            onClick={ensureWelcomeTemplate}
            disabled={ensuringWelcome}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#0369a1",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "8px 16px",
              fontSize: 13,
              cursor: ensuringWelcome ? "wait" : "pointer",
              fontWeight: 500,
              opacity: ensuringWelcome ? 0.7 : 1,
            }}
            title="Auto-welcome for new / returning customers — Google Maps + Instagram buttons"
          >
            <i className="fa-solid fa-hand-sparkles" style={{ fontSize: 12 }} />
            {ensuringWelcome ? "Submitting…" : "Submit welcome template"}
          </button>
          <button
            type="button"
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
            type="button"
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
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 4px 0" }}>
            Template builder
          </h2>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 12px 0" }}>
            Guided form builds a Meta-ready payload and submits it for verification automatically. Use{" "}
            {"{{1}}"} / {"{{2}}"} for personalization (customer name, date, etc.).
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>Start from:</span>
            {STARTER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm(p.apply())}
                style={{
                  fontSize: 12,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                  borderRadius: 999,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                  }))
                }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as FormState["category"] }))
                }
                style={inputStyle}
              >
                <option value="UTILITY">UTILITY (orders, reminders)</option>
                <option value="MARKETING">MARKETING (offers)</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Header (optional, TEXT)</label>
            <input
              value={form.headerText}
              onChange={(e) => setForm((f) => ({ ...f, headerText: e.target.value }))}
              placeholder={WHATSAPP_TEAM_LINE}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={labelStyle}>Body *</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => insertVar(1)}
                  style={{
                    fontSize: 11,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    background: "#fff",
                    padding: "4px 8px",
                    cursor: "pointer",
                  }}
                >
                  Insert {"{{1}}"} name
                </button>
                <button
                  type="button"
                  onClick={() => insertVar(2)}
                  style={{
                    fontSize: 11,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    background: "#fff",
                    padding: "4px 8px",
                    cursor: "pointer",
                  }}
                >
                  Insert {"{{2}}"}
                </button>
              </div>
            </div>
            <textarea
              value={form.bodyText}
              onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
              placeholder="Hello {{1}}, your return is due on {{2}}. Thank you for choosing us."
              rows={5}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {countBodyVars(form.bodyText) > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Example for {"{{1}}"} (required by Meta)</label>
                <input
                  value={form.exampleName}
                  onChange={(e) => setForm((f) => ({ ...f, exampleName: e.target.value }))}
                  placeholder="Priya"
                  style={inputStyle}
                />
              </div>
              {countBodyVars(form.bodyText) >= 2 && (
                <div>
                  <label style={labelStyle}>Example for {"{{2}}"}</label>
                  <input
                    value={form.exampleDetail}
                    onChange={(e) => setForm((f) => ({ ...f, exampleDetail: e.target.value }))}
                    placeholder="15 July"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Footer (optional)</label>
            <input
              value={form.footerText}
              onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
              placeholder={`${BRAND_FULL_NAME} · Moradabad`}
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

          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#15803d", marginBottom: 6 }}>
              Live preview (with sample values)
            </div>
            {form.headerText.trim() && (
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{form.headerText}</div>
            )}
            <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
              {previewBody(form) || "Body preview…"}
            </div>
            {form.footerText.trim() && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>{form.footerText}</div>
            )}
          </div>

          {builderError && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 0 }}>{builderError}</p>
          )}

          <button
            type="button"
            onClick={submitTemplate}
            disabled={submitting || Boolean(builderError)}
            style={{
              background: submitting || builderError ? "#d1d5db" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting || builderError ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting to Meta…" : "Build & submit to Meta for verification"}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#9ca3af",
            padding: "48px 0",
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <i className="fa-solid fa-file-lines" style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No templates found</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Click Add Template to build one and submit to Meta</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "#1f2937" }}>{t.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        background: "#f3f4f6",
                        color: "#4b5563",
                        padding: "2px 8px",
                        borderRadius: 20,
                      }}
                    >
                      {t.category}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        background: "#eff6ff",
                        color: "#2563eb",
                        padding: "2px 8px",
                        borderRadius: 20,
                      }}
                    >
                      {t.language}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    {statusIcon(t.status)}
                    {t.status}
                  </div>
                </div>
                <button
                  type="button"
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
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#9ca3af",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {c.type}
                      {c.format ? ` (${c.format})` : ""}
                    </div>
                    {c.text && (
                      <div
                        style={{
                          marginTop: 4,
                          color: "#374151",
                          whiteSpace: "pre-wrap",
                          background: "#f9fafb",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        {c.text}
                      </div>
                    )}
                    {c.buttons && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        {c.buttons.map((btn, j) => (
                          <span
                            key={j}
                            style={{
                              fontSize: 12,
                              background: "#eff6ff",
                              color: "#2563eb",
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #bfdbfe",
                            }}
                          >
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
