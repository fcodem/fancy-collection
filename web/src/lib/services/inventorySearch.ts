/**
 * Ranked inventory text search — shared by inventory search + dress-name suggest APIs.
 *
 * Rank tiers (lower = better):
 *   1 exact SKU, 2 exact name, 3 SKU prefix, 4 name prefix, 5 contains/trigram, 6 condition notes
 */
import prisma, { isSqliteDb } from "@/lib/prisma";
import { dressDisplayName, normalizeDressSearchKey, stripUnitSuffix } from "@/lib/dress";
import { photoUrl } from "@/lib/photoUrl";

export type InventorySearchRow = {
  id: number;
  name: string;
  display_name: string;
  sku: string;
  category: string;
  size: string;
  color: string;
  status: string;
  photo: string;
  /** Full catalog photo URL for sharp zoom. */
  photo_url?: string | null;
  thumbnail_url: string | null;
  sub_category: string;
  daily_rate: number;
  deposit: number;
  rank: number;
};

export type InventorySearchParams = {
  q: string;
  category?: string;
  itemType?: string;
  limit?: number;
};

const SEARCH_SELECT = {
  id: true,
  name: true,
  sku: true,
  category: true,
  size: true,
  color: true,
  status: true,
  subCategory: true,
  dailyRate: true,
  deposit: true,
  thumbnailPhoto: true,
  photo: true,
} as const;

type RawItem = {
  id: number;
  name: string;
  sku: string;
  category: string;
  size: string | null;
  color: string | null;
  status: string;
  subCategory: string | null;
  dailyRate: number;
  deposit: number;
  thumbnailPhoto: string | null;
  photo: string | null;
  conditionNotes?: string | null;
  rank: number;
};

const MIN_FUZZY_LEN = 2;
const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 20;

function clampLimit(n?: number) {
  const v = Math.floor(Number(n) || DEFAULT_LIMIT);
  return Math.max(1, Math.min(MAX_LIMIT, v));
}

function thumbRef(item: { thumbnailPhoto: string | null; photo: string | null }) {
  return item.thumbnailPhoto || item.photo || "";
}

function serializeRow(item: RawItem): InventorySearchRow {
  const thumb = thumbRef(item);
  const full = item.photo || item.thumbnailPhoto || "";
  return {
    id: item.id,
    name: item.name,
    display_name: dressDisplayName(item.name, item.category, item.size),
    sku: item.sku,
    category: item.category,
    size: item.size || "",
    color: item.color || "",
    status: item.status,
    photo: thumb,
    photo_url: full ? photoUrl(full) : null,
    thumbnail_url: thumb ? photoUrl(thumb) : null,
    sub_category: item.subCategory || "",
    daily_rate: item.dailyRate,
    deposit: item.deposit,
    rank: item.rank,
  };
}

function rankItem(
  item: Omit<RawItem, "rank">,
  qLower: string,
  qNorm: string,
  qCompact: string,
): number | null {
  const sku = (item.sku || "").toLowerCase();
  const name = (item.name || "").toLowerCase();
  const baseName = stripUnitSuffix(item.name).toLowerCase();
  const notes = (item.conditionNotes || "").toLowerCase();
  const nameCompact = normalizeDressSearchKey(item.name);
  const baseCompact = normalizeDressSearchKey(baseName);
  const skuCompact = normalizeDressSearchKey(sku);

  if (sku === qLower || skuCompact === qCompact) return 1;
  if (name === qLower || baseName === qLower || nameCompact === qCompact || baseCompact === qCompact) return 2;
  if (qNorm.length >= MIN_FUZZY_LEN || qCompact.length >= MIN_FUZZY_LEN) {
    if (sku.startsWith(qLower) || skuCompact.startsWith(qCompact)) return 3;
    if (
      name.startsWith(qLower) ||
      baseName.startsWith(qLower) ||
      nameCompact.startsWith(qCompact) ||
      baseCompact.startsWith(qCompact)
    ) {
      return 4;
    }
    if (
      sku.includes(qLower) ||
      name.includes(qLower) ||
      baseName.includes(qLower) ||
      nameCompact.includes(qCompact) ||
      baseCompact.includes(qCompact) ||
      skuCompact.includes(qCompact)
    ) {
      return 5;
    }
    if (notes.includes(qLower) || normalizeDressSearchKey(notes).includes(qCompact)) return 6;
  }
  return null;
}

function mergeRanked(items: RawItem[], limit: number): InventorySearchRow[] {
  const byId = new Map<number, RawItem>();
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev || item.rank < prev.rank) byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.id - b.id)
    .slice(0, limit)
    .map(serializeRow);
}

async function searchInventoryTextPrisma(opts: {
  q: string;
  qLower: string;
  qCompact: string;
  category: string;
  itemType: string;
  limit: number;
}): Promise<InventorySearchRow[]> {
  const { q, qLower, qCompact, category, itemType, limit } = opts;
  if (q.length < MIN_FUZZY_LEN && qCompact.length < MIN_FUZZY_LEN) {
    const exact = await prisma.clothingItem.findFirst({
      where: {
        sku: { equals: q, mode: "insensitive" },
        ...(category ? { category } : {}),
        ...(itemType ? { itemType } : {}),
      },
      select: { ...SEARCH_SELECT, conditionNotes: true },
    });
    if (!exact) return [];
    const rank = rankItem(exact, qLower, q, qCompact);
    if (rank == null) return [];
    return [serializeRow({ ...exact, rank })];
  }

  const tokens = qLower.split(/[^a-z0-9]+/).filter(Boolean);
  const where = {
    ...(category ? { category } : {}),
    ...(itemType ? { itemType } : {}),
    OR: [
      { sku: { equals: q, mode: "insensitive" as const } },
      { name: { equals: q, mode: "insensitive" as const } },
      { sku: { startsWith: q, mode: "insensitive" as const } },
      { name: { startsWith: q, mode: "insensitive" as const } },
      { sku: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { conditionNotes: { contains: q, mode: "insensitive" as const } },
      ...tokens.flatMap((token) => [
        { name: { contains: token, mode: "insensitive" as const } },
        { sku: { contains: token, mode: "insensitive" as const } },
      ]),
    ],
  };

  const rows = await prisma.clothingItem.findMany({
    where,
    select: { ...SEARCH_SELECT, conditionNotes: true },
    take: Math.min(limit * 8, 120),
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const ranked: RawItem[] = [];
  for (const row of rows) {
    const rank = rankItem(row, qLower, q, qCompact);
    if (rank != null) ranked.push({ ...row, rank });
  }
  return mergeRanked(ranked, limit);
}

async function searchInventoryTextPostgres(opts: {
  q: string;
  qLower: string;
  qCompact: string;
  category: string;
  itemType: string;
  limit: number;
}): Promise<InventorySearchRow[]> {
  const { qLower, qCompact, category, itemType, limit } = opts;
  const allowFuzzy = qLower.length >= MIN_FUZZY_LEN || qCompact.length >= MIN_FUZZY_LEN;

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      name: string;
      sku: string;
      category: string;
      size: string | null;
      color: string | null;
      status: string;
      sub_category: string | null;
      daily_rate: number;
      deposit: number;
      thumbnail_photo: string | null;
      photo: string | null;
      rank: number;
    }>
  >`
    SELECT
      id,
      name,
      sku,
      category,
      size,
      color,
      status,
      sub_category,
      daily_rate,
      deposit,
      thumbnail_photo,
      photo,
      CASE
        WHEN lower(sku) = ${qLower}
          OR regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') = ${qCompact}
          THEN 1
        WHEN lower(name) = ${qLower}
          OR lower(regexp_replace(name, '\\s+#\\d+$', '')) = ${qLower}
          OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = ${qCompact}
          OR regexp_replace(lower(regexp_replace(name, '\\s+#\\d+$', '')), '[^a-z0-9]', '', 'g') = ${qCompact}
          THEN 2
        WHEN ${allowFuzzy} AND (
          lower(sku) LIKE ${qLower + "%"}
          OR regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') LIKE ${qCompact + "%"}
        ) THEN 3
        WHEN ${allowFuzzy} AND (
          lower(name) LIKE ${qLower + "%"}
          OR lower(regexp_replace(name, '\\s+#\\d+$', '')) LIKE ${qLower + "%"}
          OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') LIKE ${qCompact + "%"}
          OR regexp_replace(lower(regexp_replace(name, '\\s+#\\d+$', '')), '[^a-z0-9]', '', 'g') LIKE ${qCompact + "%"}
        ) THEN 4
        WHEN ${allowFuzzy} AND (
          lower(name) LIKE ${"%" + qLower + "%"}
          OR lower(sku) LIKE ${"%" + qLower + "%"}
          OR lower(regexp_replace(name, '\\s+#\\d+$', '')) LIKE ${"%" + qLower + "%"}
          OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
          OR regexp_replace(lower(regexp_replace(name, '\\s+#\\d+$', '')), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
          OR regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
        ) THEN 5
        WHEN ${allowFuzzy} AND (
          lower(coalesce(condition_notes, '')) LIKE ${"%" + qLower + "%"}
          OR regexp_replace(lower(coalesce(condition_notes, '')), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
        ) THEN 6
        ELSE 99
      END AS rank
    FROM clothing_items
    WHERE
      (${category} = '' OR category = ${category})
      AND (${itemType} = '' OR item_type = ${itemType})
      AND (
        lower(sku) = ${qLower}
        OR regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') = ${qCompact}
        OR (
          ${allowFuzzy}
          AND (
            lower(name) = ${qLower}
            OR lower(regexp_replace(name, '\\s+#\\d+$', '')) = ${qLower}
            OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = ${qCompact}
            OR regexp_replace(lower(regexp_replace(name, '\\s+#\\d+$', '')), '[^a-z0-9]', '', 'g') = ${qCompact}
            OR lower(sku) LIKE ${qLower + "%"}
            OR lower(name) LIKE ${qLower + "%"}
            OR lower(regexp_replace(name, '\\s+#\\d+$', '')) LIKE ${qLower + "%"}
            OR lower(name) LIKE ${"%" + qLower + "%"}
            OR lower(sku) LIKE ${"%" + qLower + "%"}
            OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
            OR regexp_replace(lower(regexp_replace(name, '\\s+#\\d+$', '')), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
            OR regexp_replace(lower(sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + qCompact + "%"}
            OR lower(coalesce(condition_notes, '')) LIKE ${"%" + qLower + "%"}
          )
        )
      )
    ORDER BY rank ASC, name ASC, id ASC
    LIMIT ${limit}
  `;

  const ranked: RawItem[] = rows
    .filter((r) => r.rank < 99)
    .map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      category: r.category,
      size: r.size,
      color: r.color,
      status: r.status,
      subCategory: r.sub_category,
      dailyRate: Number(r.daily_rate) || 0,
      deposit: Number(r.deposit) || 0,
      thumbnailPhoto: r.thumbnail_photo,
      photo: r.photo,
      rank: r.rank,
    }));

  return mergeRanked(ranked, limit);
}

export async function searchInventoryText(
  params: InventorySearchParams = { q: "" },
): Promise<InventorySearchRow[]> {
  const q = (params.q || "").trim();
  if (!q) return [];

  const limit = clampLimit(params.limit);
  const category = (params.category || "").trim();
  const itemType = (params.itemType || "").trim();
  const qLower = q.toLowerCase();
  const qCompact = normalizeDressSearchKey(q);

  if (isSqliteDb()) {
    return searchInventoryTextPrisma({ q, qLower, qCompact, category, itemType, limit });
  }
  return searchInventoryTextPostgres({ q, qLower, qCompact, category, itemType, limit });
}

/** Serialize rows for legacy inventory search API (category split handled by route). */
export function inventorySearchApiRow(row: InventorySearchRow) {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    sku: row.sku,
    category: row.category,
    size: row.size,
    color: row.color,
    status: row.status,
    photo: row.photo,
    sub_category: row.sub_category,
    daily_rate: row.daily_rate,
    deposit: row.deposit,
  };
}

/** Dress-name suggest shape (photo ref only — no full-size originals). */
export function dressSuggestRow(row: InventorySearchRow) {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    sku: row.sku,
    category: row.category,
    size: row.size,
    color: row.color,
    photo: row.photo,
  };
}
