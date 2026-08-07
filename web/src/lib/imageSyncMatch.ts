import { stripUnitSuffix } from "@/lib/dress";

export type SyncMatchCandidate = {
  id: number;
  name: string;
  sku: string;
  photo: string | null;
};

export function normalizeSyncDressName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Lowercase base dress name without unit suffix (#2, etc.). */
export function syncNameKey(name: string): string {
  return stripUnitSuffix(normalizeSyncDressName(name)).toLowerCase();
}

function preferMissingPhoto(items: SyncMatchCandidate[]): SyncMatchCandidate {
  const without = items.filter((i) => !i.photo?.trim());
  const pool = without.length ? without : items;
  return [...pool].sort((a, b) => a.id - b.id)[0]!;
}

/**
 * Match a ZIP filename (no extension) to one inventory row.
 * Handles case differences and unit suffixes like "PINK BRIDAL #1".
 */
export function pickInventorySyncMatch(
  rawName: string,
  items: SyncMatchCandidate[],
): SyncMatchCandidate | null {
  const norm = normalizeSyncDressName(rawName);
  if (!norm) return null;

  const exact = items.filter((i) => i.name.trim().toLowerCase() === norm.toLowerCase());
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return preferMissingPhoto(exact);

  const key = syncNameKey(norm);
  const baseMatches = items.filter((i) => syncNameKey(i.name) === key);
  if (baseMatches.length === 1) return baseMatches[0]!;
  if (baseMatches.length > 1) return preferMissingPhoto(baseMatches);

  const words = norm.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const wordMatches = items.filter((i) => {
    const base = syncNameKey(i.name);
    return words.every((w) => base.includes(w));
  });
  if (wordMatches.length === 1) return wordMatches[0]!;
  if (wordMatches.length > 1) return preferMissingPhoto(wordMatches);

  return null;
}
