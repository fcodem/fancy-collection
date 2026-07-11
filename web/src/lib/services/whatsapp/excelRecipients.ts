import { normalizeIndianPhone } from "@/lib/phone";

export type ExcelRecipient = { name: string; phone: string };

function pickColumn(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase() === cand);
    if (hit != null && row[hit] != null && String(row[hit]).trim()) {
      return String(row[hit]).trim();
    }
  }
  for (const cand of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase().includes(cand));
    if (hit != null && row[hit] != null && String(row[hit]).trim()) {
      return String(row[hit]).trim();
    }
  }
  return "";
}

/** Parse Excel/CSV buffer into unique { name, phone } rows. */
export async function parseRecipientsWorkbook(
  buffer: Buffer,
  filename?: string,
): Promise<{ recipients: ExcelRecipient[]; errors: string[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { recipients: [], errors: ["Excel file has no sheets"] };

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    return {
      recipients: [],
      errors: [
        `No data rows found${filename ? ` in ${filename}` : ""}. Use headers like Name and Phone / WhatsApp.`,
      ],
    };
  }

  const recipients: ExcelRecipient[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const name =
      pickColumn(row, [
        "customer name",
        "customer_name",
        "name",
        "full name",
        "fullname",
        "client",
      ]) || "Customer";
    const phoneRaw = pickColumn(row, [
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
      errors.push(`Row ${idx + 2}: missing phone/WhatsApp number`);
      return;
    }
    const normalized = normalizeIndianPhone(phoneRaw);
    if (!normalized) {
      errors.push(`Row ${idx + 2}: invalid phone "${phoneRaw}"`);
      return;
    }
    const key = normalized.replace(/\D/g, "").slice(-10);
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({ name, phone: normalized });
  });

  return { recipients, errors };
}
