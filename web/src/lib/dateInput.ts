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

function expandYearPart(raw: number, baseYear: number): number {
  if (raw >= 1000) return raw;
  if (raw >= 100) return raw;
  const century = Math.floor(baseYear / 100) * 100;
  return century + raw;
}

function buildIso(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

function parseDigitsPartial(digits: string, baseYear: number, baseMonth: number): string | null {
  const len = digits.length;
  if (len === 0) return null;

  let day: number;
  let month: number;
  let year: number;

  if (len <= 2) {
    day = Number(digits);
    month = baseMonth;
    year = baseYear;
  } else if (len === 3) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2));
    year = baseYear;
  } else if (len === 4) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = baseYear;
  } else if (len === 5) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = expandYearPart(Number(digits.slice(4)), baseYear);
  } else if (len === 6) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = expandYearPart(Number(digits.slice(4, 6)), baseYear);
  } else if (len === 7) {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = expandYearPart(Number(digits.slice(4)), baseYear);
  } else {
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = Number(digits.slice(4, 8));
  }

  return buildIso(day, month, year);
}

/**
 * Parse typed date, filling missing month/year from the current field value.
 * e.g. base 26-06-2026 + "29" → 29-06-2026; "29-07" → 29-07-2026.
 */
export function parsePartialDateEdit(raw: string, baseIso: string | null): string | null {
  const s = raw.trim();
  if (!s) return null;

  const full = parseTypedDateToIso(s);
  if (full) return full;

  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;
  let baseYear = defaultYear;
  let baseMonth = defaultMonth;

  if (baseIso && ISO_RE.test(baseIso)) {
    const [y, m] = baseIso.split("-").map(Number);
    baseYear = y;
    baseMonth = m;
  }

  const dashed = s.match(/^(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{2,4}))?)?$/);
  if (dashed) {
    const day = Number(dashed[1]);
    const month = dashed[2] != null ? Number(dashed[2]) : baseMonth;
    let year = baseYear;
    if (dashed[3] != null) {
      year = expandYearPart(Number(dashed[3]), baseYear);
    }
    return buildIso(day, month, year);
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 8) {
    return parseDigitsPartial(digits, baseYear, baseMonth);
  }
  if (digits.length === 8) {
    return parseDigitsPartial(digits, baseYear, baseMonth);
  }

  return null;
}

function isValidIsoDate(iso: string): boolean {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Add calendar days to an ISO date (YYYY-MM-DD). */
export function addDaysIso(iso: string, days: number): string {
  if (!ISO_RE.test(iso)) return iso;
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
