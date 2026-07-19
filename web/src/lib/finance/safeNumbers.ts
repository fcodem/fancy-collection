/** Coerce API / chart payloads to finite numbers without throwing. */
export function numberValue(raw: unknown, fallback = 0): number {
  if (raw == null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize category maps and numeric record payloads. */
export function numberMap(raw: unknown): Record<string, number> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = numberValue(val);
  }
  return out;
}

export function numberMapKeys(raw: unknown): string[] {
  return Object.keys(numberMap(raw));
}

export function numberMapValues(raw: unknown): number[] {
  return Object.values(numberMap(raw));
}

export function mergeNumberMaps(
  ...maps: Array<Record<string, number> | null | undefined>
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [cat, amt] of Object.entries(numberMap(map))) {
      merged[cat] = (merged[cat] || 0) + amt;
    }
  }
  return merged;
}

export function categoryLabelKeys(
  ...maps: Array<Record<string, number> | null | undefined>
): string[] {
  return [...new Set(maps.flatMap((m) => Object.keys(numberMap(m))))].sort();
}
