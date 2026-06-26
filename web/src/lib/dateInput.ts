const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

export function formatPartialDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export function isIsoDate(s: string): boolean {
  return ISO_RE.test(s);
}

export function isoToDisplay(iso: string): string {
  if (!iso || !ISO_RE.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function parseTypedDateToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (ISO_RE.test(s)) return isValidIsoDate(s) ? s : null;
  const m = s.match(DMY_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

function isValidIsoDate(iso: string): boolean {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
