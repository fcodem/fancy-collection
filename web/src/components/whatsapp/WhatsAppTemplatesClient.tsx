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
    buttons?: Array<{ type: string; text: string }>;
  }>;
};

export default function WhatsAppTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = await res.json() as { templates?: Template[] };
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

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>Loading templates...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb" }}>
          <i className="fa-solid fa-file-lines" style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No templates found</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Create templates in Meta Business Manager</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: "#1f2937" }}>{t.name}</span>
                    <span style={{ fontSize: 11, background: "#f3f4f6", color: "#4b5563", padding: "2px 8px", borderRadius: 20 }}>{t.category}</span>
                    <span style={{ fontSize: 11, background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 20 }}>{t.language}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                    {statusIcon(t.status)}
                    {t.status}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {t.components.map((c, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.type}</div>
                    {c.text && (
                      <div style={{ marginTop: 4, color: "#374151", whiteSpace: "pre-wrap", background: "#f9fafb", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                        {c.text}
                      </div>
                    )}
                    {c.buttons && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {c.buttons.map((btn, j) => (
                          <span key={j} style={{ fontSize: 12, background: "#eff6ff", color: "#2563eb", padding: "4px 8px", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                            {btn.text}
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
