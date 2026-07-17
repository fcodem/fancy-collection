/**
 * Cursor-paginated inventory group summaries — DB aggregation, slim payloads.
 */
import prisma, { isSqliteDb } from "@/lib/prisma";
import { photoUrl } from "@/lib/photoUrl";
import { stripUnitSuffix } from "@/lib/dress";

export type InventoryGroupSummary = {
  groupKey: string;
  inventoryGroupId: string | null;
  primaryId: number;
  primarySku: string;
  baseName: string;
  category: string;
  size: string;
  color: string;
  totalQuantity: number;
  availableQuantity: number;
  rentedQuantity: number;
  maintenanceQuantity: number;
  dailyRate: number;
  thumbnailUrl: string | null;
  newestCreatedAt: string;
};

export type InventoryListParams = {
  cursor?: string | null;
  limit?: number;
  q?: string;
  category?: string;
  status?: string;
  sort?: "name" | "newest";
};

export type InventoryListResult = {
  groups: InventoryGroupSummary[];
  nextCursor: string | null;
  rowCount: number;
};

const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 40;

function clampLimit(n?: number) {
  const v = Math.floor(Number(n) || DEFAULT_LIMIT);
  return Math.max(1, Math.min(MAX_LIMIT, v));
}

type CursorPayload = { sort: "name" | "newest"; v1: string; v2: string };

export function decodeCursor(raw?: string | null): CursorPayload | null {
  if (!raw?.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if ((parsed.sort === "name" || parsed.sort === "newest") && parsed.v1 && parsed.v2) {
      return { sort: parsed.sort, v1: parsed.v1, v2: parsed.v2 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function looksLikeSku(q: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9\-]{1,31}$/.test(q.trim()) && !/\s/.test(q.trim());
}

/** Stable fallback group key for rows without inventory_group_id. */
export function inventoryFallbackGroupKey(item: {
  name: string;
  category: string;
  size?: string | null;
  color?: string | null;
}): string {
  const base = stripUnitSuffix(item.name);
  return `legacy:${base}|${item.category}|${item.size || ""}|${item.color || ""}`;
}

export async function listInventoryGroups(
  params: InventoryListParams = {},
): Promise<InventoryListResult> {
  const limit = clampLimit(params.limit);
  const q = (params.q || "").trim();
  const category = (params.category || "").trim();
  const status = (params.status || "").trim();
  const sortNewest = params.sort === "newest";
  const cursor = decodeCursor(params.cursor);

  if (!isSqliteDb()) {
    return listInventoryGroupsPostgres({
      limit,
      q,
      category,
      status,
      sortNewest,
      cursor,
    });
  }

  return listInventoryGroupsPrismaFallback({
    limit,
    q,
    category,
    status,
    sortNewest,
    cursor,
  });
}

function summarizeGroup(
  groupKey: string,
  items: Array<{
    id: number;
    sku: string;
    name: string;
    category: string;
    size: string | null;
    color: string | null;
    status: string;
    dailyRate: number;
    photo: string | null;
    thumbnailPhoto?: string | null;
    inventoryGroupId: string | null;
    createdAt: Date;
  }>,
): InventoryGroupSummary {
  const primary = [...items].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0]!;
  const thumb = primary.thumbnailPhoto || primary.photo;
  return {
    groupKey,
    inventoryGroupId: primary.inventoryGroupId,
    primaryId: primary.id,
    primarySku: primary.sku,
    baseName: stripUnitSuffix(primary.name),
    category: primary.category,
    size: primary.size || "",
    color: primary.color || "",
    totalQuantity: items.length,
    availableQuantity: items.filter((i) => i.status === "available").length,
    rentedQuantity: items.filter((i) => i.status === "rented").length,
    maintenanceQuantity: items.filter((i) => i.status === "maintenance").length,
    dailyRate: primary.dailyRate,
    thumbnailUrl: thumb ? photoUrl(thumb) : null,
    newestCreatedAt: primary.createdAt.toISOString(),
  };
}

const ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  size: true,
  color: true,
  status: true,
  dailyRate: true,
  photo: true,
  thumbnailPhoto: true,
  inventoryGroupId: true,
  createdAt: true,
} as const;

async function listInventoryGroupsPostgres(opts: {
  limit: number;
  q: string;
  category: string;
  status: string;
  sortNewest: boolean;
  cursor: CursorPayload | null;
}): Promise<InventoryListResult> {
  const { limit, q, category, status, sortNewest, cursor } = opts;

  if (q && looksLikeSku(q)) {
    const exact = await prisma.clothingItem.findFirst({
      where: { sku: { equals: q, mode: "insensitive" } },
      select: ITEM_SELECT,
    });
    if (exact) {
      const groupKey = exact.inventoryGroupId || inventoryFallbackGroupKey(exact);
      const siblings = exact.inventoryGroupId
        ? await prisma.clothingItem.findMany({
            where: { inventoryGroupId: exact.inventoryGroupId },
            select: ITEM_SELECT,
          })
        : [exact];
      return {
        groups: [summarizeGroup(groupKey, siblings)],
        nextCursor: null,
        rowCount: 1,
      };
    }
  }

  // Keyset values — unused branches receive sentinel values that match no row.
  const cursorTs = cursor?.sort === "newest" ? cursor.v1 : "1970-01-01T00:00:00.000Z";
  const cursorName = cursor?.sort === "name" ? cursor.v1 : "";
  const cursorKey = cursor?.v2 ?? "";
  const hasCursor = Boolean(cursor);
  const useNewest = sortNewest;

  const rows = await prisma.$queryRaw<
    Array<{
      group_key: string;
      inventory_group_id: string | null;
      primary_id: number;
      primary_sku: string;
      base_name: string;
      category: string;
      size: string;
      color: string;
      total_qty: number;
      available_qty: number;
      rented_qty: number;
      maintenance_qty: number;
      daily_rate: number;
      thumb_ref: string | null;
      newest_created_at: Date;
    }>
  >`
    WITH base AS (
      SELECT
        id,
        sku,
        name,
        category,
        COALESCE(size, '') AS size,
        COALESCE(color, '') AS color,
        status,
        daily_rate,
        photo,
        thumbnail_photo,
        inventory_group_id,
        created_at,
        COALESCE(
          inventory_group_id,
          'legacy:' || regexp_replace(name, '\\s+#\\d+$', '') || '|' || category || '|' || COALESCE(size, '') || '|' || COALESCE(color, '')
        ) AS group_key,
        regexp_replace(name, '\\s+#\\d+$', '') AS base_name
      FROM clothing_items
      WHERE
        (${category} = '' OR category = ${category})
        AND (${status} = '' OR status = ${status})
        AND (
          ${q} = ''
          OR lower(name) LIKE '%' || lower(${q}) || '%'
          OR lower(sku) LIKE '%' || lower(${q}) || '%'
          OR lower(COALESCE(condition_notes, '')) LIKE '%' || lower(${q}) || '%'
        )
    ),
    agg AS (
      SELECT
        group_key,
        MAX(inventory_group_id) AS inventory_group_id,
        MAX(base_name) AS base_name,
        MAX(category) AS category,
        MAX(size) AS size,
        MAX(color) AS color,
        COUNT(*)::int AS total_qty,
        COUNT(*) FILTER (WHERE status = 'available')::int AS available_qty,
        COUNT(*) FILTER (WHERE status = 'rented')::int AS rented_qty,
        COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance_qty,
        MAX(daily_rate)::float AS daily_rate,
        MAX(created_at) AS newest_created_at,
        (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1]::int AS primary_id,
        (ARRAY_AGG(sku ORDER BY created_at DESC, id DESC))[1] AS primary_sku,
        (ARRAY_AGG(COALESCE(thumbnail_photo, photo) ORDER BY created_at DESC, id DESC))[1] AS thumb_ref
      FROM base
      GROUP BY group_key
    )
    SELECT *
    FROM agg
    WHERE
      NOT ${hasCursor}
      OR (
        ${useNewest}
        AND (
          newest_created_at < ${cursorTs}::timestamptz
          OR (newest_created_at = ${cursorTs}::timestamptz AND group_key > ${cursorKey})
        )
      )
      OR (
        NOT ${useNewest}
        AND (
          base_name > ${cursorName}
          OR (base_name = ${cursorName} AND group_key > ${cursorKey})
        )
      )
    ORDER BY
      CASE WHEN ${useNewest} THEN newest_created_at END DESC NULLS LAST,
      base_name ASC,
      group_key ASC
    LIMIT ${limit + 1}
  `;

  const page = rows.slice(0, limit);
  const groups: InventoryGroupSummary[] = page.map((r) => ({
    groupKey: r.group_key,
    inventoryGroupId: r.inventory_group_id,
    primaryId: r.primary_id,
    primarySku: r.primary_sku,
    baseName: r.base_name,
    category: r.category,
    size: r.size,
    color: r.color,
    totalQuantity: r.total_qty,
    availableQuantity: r.available_qty,
    rentedQuantity: r.rented_qty,
    maintenanceQuantity: r.maintenance_qty,
    dailyRate: Number(r.daily_rate) || 0,
    thumbnailUrl: r.thumb_ref ? photoUrl(r.thumb_ref) : null,
    newestCreatedAt: new Date(r.newest_created_at).toISOString(),
  }));

  let nextCursor: string | null = null;
  if (rows.length > limit && groups.length) {
    const last = groups[groups.length - 1]!;
    nextCursor = encodeCursor(
      sortNewest
        ? { sort: "newest", v1: last.newestCreatedAt, v2: last.groupKey }
        : { sort: "name", v1: last.baseName, v2: last.groupKey },
    );
  }

  return { groups, nextCursor, rowCount: groups.length };
}

/** Prisma fallback (SQLite / when raw SQL unavailable). */
async function listInventoryGroupsPrismaFallback(opts: {
  limit: number;
  q: string;
  category: string;
  status: string;
  sortNewest: boolean;
  cursor: CursorPayload | null;
}): Promise<InventoryListResult> {
  const items = await prisma.clothingItem.findMany({
    where: {
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" } },
              { sku: { contains: opts.q, mode: "insensitive" } },
              { conditionNotes: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: ITEM_SELECT,
    orderBy: opts.sortNewest
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : [{ category: "asc" }, { name: "asc" }],
    take: 500,
  });

  const map = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.inventoryGroupId || inventoryFallbackGroupKey(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }

  let groups = Array.from(map.entries()).map(([key, rows]) => summarizeGroup(key, rows));
  groups.sort((a, b) => {
    if (opts.sortNewest) {
      const t = b.newestCreatedAt.localeCompare(a.newestCreatedAt);
      if (t !== 0) return t;
      return a.groupKey.localeCompare(b.groupKey);
    }
    const n = a.baseName.localeCompare(b.baseName);
    if (n !== 0) return n;
    return a.groupKey.localeCompare(b.groupKey);
  });

  if (opts.cursor) {
    const idx = groups.findIndex((g) => g.groupKey === opts.cursor!.v2);
    if (idx >= 0) groups = groups.slice(idx + 1);
  }

  const page = groups.slice(0, opts.limit);
  const nextCursor =
    groups.length > opts.limit && page.length
      ? encodeCursor(
          opts.sortNewest
            ? {
                sort: "newest",
                v1: page[page.length - 1]!.newestCreatedAt,
                v2: page[page.length - 1]!.groupKey,
              }
            : {
                sort: "name",
                v1: page[page.length - 1]!.baseName,
                v2: page[page.length - 1]!.groupKey,
              },
        )
      : null;

  return { groups: page, nextCursor, rowCount: page.length };
}

export async function listInventoryGroupItems(groupKey: string) {
  if (groupKey.startsWith("legacy:")) {
    const rest = groupKey.slice("legacy:".length);
    const [baseName, category, size, color] = rest.split("|");
    const items = await prisma.clothingItem.findMany({
      where: {
        category: category || undefined,
        size: size || "",
        color: color || "",
        inventoryGroupId: null,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        size: true,
        color: true,
        status: true,
        dailyRate: true,
        photo: true,
        thumbnailPhoto: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    return items.filter((i) => stripUnitSuffix(i.name) === (baseName || ""));
  }

  return prisma.clothingItem.findMany({
    where: { inventoryGroupId: groupKey },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      size: true,
      color: true,
      status: true,
      dailyRate: true,
      photo: true,
      thumbnailPhoto: true,
    },
    orderBy: { name: "asc" },
    take: 100,
  });
}
