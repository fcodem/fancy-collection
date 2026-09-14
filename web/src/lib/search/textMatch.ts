/**
 * Shared text-search matching for inventory + booking dress lookups.
 * Keep client filters, Prisma where, and SQL builders on the same rules.
 */
import type { Prisma } from "@prisma/client";
import {
  dressNameWords,
  normalizeDressSearchKey,
  normalizeDressSearchQuery,
} from "@/lib/search/normalize";

export type ParsedSearchQuery = {
  raw: string;
  trimmed: string;
  compact: string;
  words: string[];
  digits: string;
};

export function parseSearchQuery(q: string): ParsedSearchQuery {
  const raw = (q || "").trim();
  const trimmed = normalizeDressSearchQuery(raw) || raw;
  return {
    raw,
    trimmed,
    compact: normalizeDressSearchKey(trimmed),
    words: dressNameWords(trimmed),
    digits: trimmed.replace(/\D/g, ""),
  };
}

/** True when haystack matches query by words and/or compact key. */
export function textMatches(haystack: string, q: string): boolean {
  const { trimmed, compact, words } = parseSearchQuery(q);
  if (!trimmed) return true;
  const text = (haystack || "").toLowerCase();
  if (!text) return false;
  if (words.length && words.every((w) => text.includes(w))) return true;
  const compactText = normalizeDressSearchKey(haystack);
  if (compact && compactText.includes(compact)) return true;
  return Boolean(words.length && words.every((w) => compactText.includes(w)));
}

/** Client-side inventory row match — name, display, SKU, color, notes. */
export function inventoryFieldsMatch(
  item: {
    name?: string | null;
    display_name?: string | null;
    sku?: string | null;
    color?: string | null;
    conditionNotes?: string | null;
    condition_notes?: string | null;
  },
  q: string,
): boolean {
  const { trimmed } = parseSearchQuery(q);
  if (!trimmed) return true;
  const notes = item.conditionNotes || item.condition_notes || "";
  const combined = [item.name, item.display_name, item.sku, item.color, notes]
    .filter(Boolean)
    .join(" ");
  return (
    textMatches(item.name || "", q) ||
    textMatches(item.display_name || "", q) ||
    textMatches(item.sku || "", q) ||
    textMatches(item.color || "", q) ||
    textMatches(notes, q) ||
    textMatches(combined, q)
  );
}

/** Prisma where for clothing_items text search (name/sku/color/notes, word-AND). */
export function inventoryPrismaWhere(q: string): Prisma.ClothingItemWhereInput | undefined {
  const { trimmed, words } = parseSearchQuery(q);
  if (!trimmed) return undefined;
  if (words.length <= 1) {
    const term = words[0] || trimmed;
    return {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { sku: { contains: term, mode: "insensitive" } },
        { color: { contains: term, mode: "insensitive" } },
        { conditionNotes: { contains: term, mode: "insensitive" } },
      ],
    };
  }
  return {
    AND: words.map((word) => ({
      OR: [
        { name: { contains: word, mode: "insensitive" as const } },
        { sku: { contains: word, mode: "insensitive" as const } },
        { color: { contains: word, mode: "insensitive" as const } },
        { conditionNotes: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
}

/** Prisma where for booking dress text (legacy + line items + SKU). */
export function bookingDressPrismaWhere(q: string): Prisma.BookingWhereInput {
  const { trimmed, words } = parseSearchQuery(q);
  if (!trimmed) return {};
  const terms = words.length ? words : [trimmed];
  return {
    AND: terms.map((w) => ({
      OR: [
        { dressName: { contains: w, mode: "insensitive" as const } },
        { bookingItems: { some: { dressName: { contains: w, mode: "insensitive" as const } } } },
        { legacyItem: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
        { legacyItem: { is: { name: { contains: w, mode: "insensitive" as const } } } },
        {
          bookingItems: {
            some: { item: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
          },
        },
        {
          bookingItems: {
            some: { item: { is: { name: { contains: w, mode: "insensitive" as const } } } },
          },
        },
        {
          bookingItems: {
            some: { item: { is: { color: { contains: w, mode: "insensitive" as const } } } },
          },
        },
      ],
    })),
  };
}

/** Phrase-first booking dress where (fast path), with word-AND already covered by bookingDressPrismaWhere. */
export function bookingDressPrismaWhereQuick(q: string): Prisma.BookingWhereInput {
  const { trimmed } = parseSearchQuery(q);
  if (!trimmed) return {};
  return {
    OR: [
      { dressName: { contains: trimmed, mode: "insensitive" as const } },
      {
        bookingItems: {
          some: { dressName: { contains: trimmed, mode: "insensitive" as const } },
        },
      },
      { legacyItem: { is: { sku: { equals: trimmed, mode: "insensitive" as const } } } },
      {
        bookingItems: {
          some: { item: { is: { sku: { equals: trimmed, mode: "insensitive" as const } } } },
        },
      },
      bookingDressPrismaWhere(trimmed),
    ],
  };
}

export function customerNamePrismaWhere(q: string): Prisma.BookingWhereInput {
  const { words, trimmed } = parseSearchQuery(q);
  const terms = words.length ? words : trimmed ? [trimmed] : [];
  if (!terms.length) return {};
  return {
    AND: terms.map((w) => ({
      customerName: { contains: w, mode: "insensitive" as const },
    })),
  };
}
