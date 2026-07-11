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

type ExcelRecipient = { name: string; phone: string };

type RecipientType = "all_customers" | "pending_returns" | "custom_phones" | "excel_sheet";

function templateHasNameVar(t: Template | undefined): boolean {
  if (!t) return false;
  const body = t.components.find((c) => c.type === "BODY")?.text || "";
  return /\{\{\s*1\s*\}\}/.test(body);
}

async function parseExcelFile(file: File): Promise<{ recipients: ExcelRecipient[]; errors: string[] }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { recipients: [], errors: ["Excel file has no sheets"] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
  if (!rows.length) {
    return { recipients: [], errors: ["No data rows. Use headers: Name, Phone (or WhatsApp / Mobile)."] };
  }

  const pick = (row: Record<string, unknown>, candidates: string[]) => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const hit = keys.find((k) => k.trim().toLowerCase() === c);
      if (hit != null && String(row[hit] || "").trim()) return String(row[hit]).trim();
    }
    for (const c of candidates) {
      const hit = keys.find((k) => k.trim().toLowerCase().includes(c));
      if (hit != null && String(row[hit] || "").trim()) return String(row[hit]).trim();
    }
    return "";
  };

  const recipients: ExcelRecipient[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const name =
      pick(row, ["customer name", "customer_name", "name", "full name", "naam", "client"]) ||
      "Customer";
    const phoneRaw = pick(row, [
      "whatsapp",
      "whatsapp no",
      "whatsapp number",
      "mobile",
      "phone",
      "phone number",
      "contact",
      "number",
      "mobile number",
    ]);
    if (!phoneRaw) {
      errors.push(`Row ${idx + 2}: missing phone`);
      return;
    }
    const digits = phoneRaw.replace(/\D/g, "");
    let phone = digits;
    if (digits.length === 10) phone = `+91${digits}`;
    else if (digits.length === 12 && digits.startsWith("91")) phone = `+${digits}`;
    else if (digits.length >= 10) phone = `+${digits}`;
    else {
      errors.push(`Row ${idx + 2}: invalid phone "${phoneRaw}"`);
      return;
    }
    const key = phone.replace(/\D/g, "").slice(-10);
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({ name, phone });
  });

  return { recipients, errors };
}

export default function WhatsAppBroadcastClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [excelRecipients, setExcelRecipients] = useState<ExcelRecipient[]>([]);
  const [excelErrors, setExcelErrors] = useState<string[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [parsingExcel, setParsingExcel] = useState(false);

  const [form, setForm] = useState({
    broadcastName: "",
    templateName: "",
    templateLanguage: "en",
    recipientType: "all_customers" as RecipientType,
    customPhones: "",
  });

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/whatsapp/templates");
      const data = (await res.json()) as { templates?: Template[] };
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
      const data = (await res.json()) as { broadcasts?: Broadcast[] };
      setBroadcasts(data.broadcasts || []);
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    }
  };

  useEffect(() => {
    loadTemplates();
    loadBroadcasts();
  }, []);

  const onExcelSelected = async (file: File | null) => {
    if (!file) {
      setExcelRecipients([]);
      setExcelErrors([]);
      setExcelFileName("");
      return;
    }
    setParsingExcel(true);
    setExcelFileName(file.name);
    try {
      const { recipients, errors } = await parseExcelFile(file);
      setExcelRecipients(recipients);
      setExcelErrors(errors.slice(0, 8));
      if (!recipients.length) {
        alert(errors[0] || "No valid rows found in the Excel sheet.");
      }
    } catch (e) {
      setExcelRecipients([]);
      setExcelErrors([e instanceof Error ? e.message : "Failed to read Excel"]);
      alert("Could not read Excel file. Use .xlsx / .xls / .csv with Name and Phone columns.");
    } finally {
      setParsingExcel(false);
    }
  };

  const handleSend = async () => {
    if (!form.broadcastName || !form.templateName) {
      alert("Please fill in broadcast name and select a template.");
      return;
    }
    if (form.recipientType === "excel_sheet" && excelRecipients.length === 0) {
      alert("Upload an Excel sheet with customer Name and Phone / WhatsApp columns first.");
      return;
    }
    setSending(true);
    try {
      const selected = templates.find((t) => t.name === form.templateName);
      const res = await fetch("/api/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customPhones: form.customPhones
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          excelRecipients: form.recipientType === "excel_sheet" ? excelRecipients : undefined,
          injectNameAsBodyVar:
            form.recipientType === "excel_sheet" || templateHasNameVar(selected),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; totalRecipients?: number; error?: string };
      if (data.ok) {
        alert(`Broadcast started! Sending to ${data.totalRecipients} recipients.`);
        setForm({
          broadcastName: "",
          templateName: "",
          templateLanguage: "en",
          recipientType: "all_customers",
          customPhones: "",
        });
        setExcelRecipients([]);
        setExcelErrors([]);
        setExcelFileName("");
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
          <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>
            Send approved templates to customers — including from an Excel sheet
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
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
                type="button"
                onClick={loadTemplates}
                style={{
                  fontSize: 12,
                  color: "#16a34a",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
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
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedTemplate && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: "#15803d", marginBottom: 4 }}>Preview:</div>
              {selectedTemplate.components
                .filter((c) => c.type === "BODY")
                .map((c, i) => (
                  <p key={i} style={{ margin: 0, color: "#374151", whiteSpace: "pre-wrap" }}>
                    {c.text}
                  </p>
                ))}
              {templateHasNameVar(selectedTemplate) && (
                <p style={{ margin: "8px 0 0", fontSize: 11, color: "#15803d" }}>
                  {"{{1}}"} will be filled with each customer&apos;s name from the recipient list / Excel.
                </p>
              )}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Recipients</label>
            <select
              value={form.recipientType}
              onChange={(e) =>
                setForm((f) => ({ ...f, recipientType: e.target.value as RecipientType }))
              }
              style={inputStyle}
            >
              <option value="all_customers">All Customers (from bookings)</option>
              <option value="pending_returns">Pending Returns (next 7 days)</option>
              <option value="custom_phones">Custom Phone Numbers</option>
              <option value="excel_sheet">Excel sheet (Name + Number)</option>
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

          {form.recipientType === "excel_sheet" && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Upload Excel (.xlsx / .xls / .csv)</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={(e) => void onExcelSelected(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: 8 }}
              />
              <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0" }}>
                First sheet only. Columns: <strong>Name</strong> (or Customer Name) and{" "}
                <strong>Phone</strong> / WhatsApp / Mobile.
              </p>
              {parsingExcel && (
                <p style={{ fontSize: 12, color: "#d97706", marginTop: 8 }}>Reading sheet…</p>
              )}
              {excelFileName && !parsingExcel && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <div>
                    <strong>{excelFileName}</strong> — {excelRecipients.length} valid recipient
                    {excelRecipients.length === 1 ? "" : "s"}
                  </div>
                  {excelRecipients.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#4b5563" }}>
                      {excelRecipients.slice(0, 5).map((r) => (
                        <li key={r.phone}>
                          {r.name} — {r.phone}
                        </li>
                      ))}
                      {excelRecipients.length > 5 && (
                        <li>…and {excelRecipients.length - 5} more</li>
                      )}
                    </ul>
                  )}
                  {excelErrors.length > 0 && (
                    <p style={{ color: "#dc2626", margin: "8px 0 0" }}>
                      Skipped rows: {excelErrors.join("; ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
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

        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: 0 }}>
              Broadcast History
            </h2>
            <button
              type="button"
              onClick={loadBroadcasts}
              style={{
                fontSize: 12,
                color: "#16a34a",
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 11 }} /> Refresh
            </button>
          </div>

          {broadcasts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>
              No broadcasts sent yet
            </div>
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
    b.status === "completed" ? (
      <i className="fa-solid fa-circle-check" style={{ color: "#16a34a" }} />
    ) : b.status === "sending" ? (
      <i className="fa-solid fa-clock" style={{ color: "#d97706" }} />
    ) : (
      <i className="fa-solid fa-circle-xmark" style={{ color: "#ef4444" }} />
    );

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
        <span>
          <i className="fa-solid fa-users" style={{ marginRight: 4, fontSize: 10 }} />
          {b.totalCount} recipients
        </span>
        <span style={{ color: "#16a34a" }}>✓ {b.sentCount} sent</span>
        {b.failedCount > 0 && <span style={{ color: "#ef4444" }}>✗ {b.failedCount} failed</span>}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
        {new Date(b.createdAt).toLocaleString("en-IN")}
      </div>
    </div>
  );
}
