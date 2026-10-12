/** Numeric sizes first (smallest → largest), then text sizes (Free Size, Custom…), blanks last. */
export function sizeRank(size: string | null | undefined): number {
  const s = (size || "").trim();
  if (!s) return Number.MAX_SAFE_INTEGER;
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ""));
  if (/^\d/.test(s) && Number.isFinite(n)) return n;
  return 100_000;
}

export function compareSizes(a: string, b: string): number {
  return sizeRank(a) - sizeRank(b) || a.localeCompare(b);
}

export function normalizeSize(size: string | null | undefined): string {
  return (size || "").trim().toUpperCase();
}

/** Sizes from labels built by `dressDisplayName` ("NAME (Category) · Size 38", comma-joined). */
export function sizesFromDressNames(dressNames: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (dressNames || "").matchAll(/·\s*Size\s+([^,·]+)/gi)) {
    const s = normalizeSize(m[1]);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function uniqueSortedSizes(lists: string[][]): string[] {
  const set = new Set<string>();
  for (const l of lists) for (const s of l) if (normalizeSize(s)) set.add(normalizeSize(s));
  return [...set].sort(compareSizes);
}

export function smallestSize(sizes: string[]): string {
  return [...sizes].sort(compareSizes)[0] || "";
}

/**
 * Filters to `selected` size (when set) and, when `sortOn`, orders rows by their
 * smallest size. Stable for equal sizes so the original date order is kept.
 */
export function applySizeFilterSort<T>(
  rows: T[],
  sizesOf: (row: T) => string[],
  opts: { selected: string; sortOn: boolean },
): T[] {
  const selected = normalizeSize(opts.selected);
  const filtered = selected
    ? rows.filter((r) => sizesOf(r).some((s) => normalizeSize(s) === selected))
    : rows;
  if (!opts.sortOn && !selected) return filtered;
  return filtered
    .map((row, i) => ({ row, i, key: selected || smallestSize(sizesOf(row).map(normalizeSize)) }))
    .sort((a, b) => compareSizes(a.key, b.key) || a.i - b.i)
    .map((x) => x.row);
}
