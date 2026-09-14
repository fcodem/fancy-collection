/** Shared search query normalization (no Prisma / no dress UI helpers). */

const UNIT_SUFFIX_RE = /\s+#\d+$/;

export function normalizeDressSearchKey(text?: string | null): string {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function dressNameWords(q: string): string[] {
  return (q || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function stripUnitSuffix(name?: string | null): string {
  return (name || "").replace(UNIT_SUFFIX_RE, "").trim();
}

/**
 * Strip UI display decorations from a search box value.
 * e.g. "FIROZI PEACOCK MULTI (Crop Top) · Size M" → "FIROZI PEACOCK MULTI"
 */
export function normalizeDressSearchQuery(q: string): string {
  let s = (q || "").trim();
  if (!s) return "";
  s = s.replace(/\s*[·|]\s*Size\s+.+$/i, "");
  s = s.replace(/\s*\([^)]*\)\s*$/g, "");
  s = stripUnitSuffix(s);
  return s.trim();
}
