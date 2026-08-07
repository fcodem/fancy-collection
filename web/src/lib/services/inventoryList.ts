/**
 * Cursor-paginated inventory group summaries — DB aggregation, slim payloads.
 */
import prisma, { isSqliteDb } from "@/lib/prisma";
import { photoUrl } from "@/lib/photoUrl";
import { stripUnitSuffix } from "@/lib/dress";
import { MENS_CATEGORIES } from "@/lib/constants";

export type MensSizeSummary = {
  size: string;
  /** Size-level group key (inventoryGroupId or legacy key) for units / QR. */
  groupKey: string;
  primaryId: number;
  primarySku: string;
  totalQuantity: number;
  availableQuantity: number;
  rentedQuantity: number;
  maintenanceQuantity: number;
  inventoryGroupId: string | null;
};

export type InventoryGroupSummary = {
  groupKey: string;
  inventoryGroupId: string | null;
  primaryId: number;
  primarySku: string;
  baseName: string;
  category: string;
  subCategory: string;
  size: string;
  color: string;
  totalQuantity: number;
  availableQuantity: number;
  rentedQuantity: number;
  maintenanceQuantity: number;
  dailyRate: number;
  thumbnailUrl: string | null;
  /** Catalog / full photo for sharp zoom (not the 180px thumb). */
  photoUrl: string | null;
  newestCreatedAt: string;
  /** Men's product card collapsed across sizes. */
  isMensProduct?: boolean;
  sizes?: MensSizeSummary[];
};

export function isMensInventoryCategory(category: string | null | undefined): boolean {
  const c = String(category || "").trim().toLowerCase();
  return MENS_CATEGORIES.some((m) => m.toLowerCase() === c);
}

/** Stable product key for men's multi-size dresses (one card in Manage Inventory). */
export function mensProductGroupKey(baseName: string, category: string): string {
  return `mens:${stripUnitSuffix(baseName).toLowerCase()}|${String(category).trim().toLowerCase()}`;
}

export function parseMensProductGroupKey(
  groupKey: string,
): { baseName: string; category: string } | null {
  if (!groupKey.startsWith("mens:")) return null;
  const rest = groupKey.slice("mens:".length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) return null;
  return {
    baseName: rest.slice(0, pipe),
    category: rest.slice(pipe + 1),
  };
}

/**
 * Collapse per-size men's groups into one product card with nested sizes.
 * Women's / jewellery / accessories stay unchanged.
 * Preserves the input list order (first occurrence of each product).
 * Idempotent for rows already marked isMensProduct with sizes.
 */
export function collapseMensProductGroups(
  groups: InventoryGroupSummary[],
): InventoryGroupSummary[] {
  const byProduct = new Map<string, InventoryGroupSummary[]>();
  const productOrder: string[] = [];
  const alreadyCollapsed = new Map<string, InventoryGroupSummary>();

  for (const g of groups) {
    if (!isMensInventoryCategory(g.category)) continue;
    const key =
      g.groupKey.startsWith("mens:") ? g.groupKey : mensProductGroupKey(g.baseName, g.category);
    if (g.isMensProduct && Array.isArray(g.sizes)) {
      if (!alreadyCollapsed.has(key)) {
        alreadyCollapsed.set(key, { ...g, groupKey: key, isMensProduct: true });
        productOrder.push(key);
      }
      continue;
    }
    if (!byProduct.has(key) && !alreadyCollapsed.has(key)) productOrder.push(key);
    const list = byProduct.get(key) || [];
    list.push(g);
    byProduct.set(key, list);
  }

  const mensByKey = new Map<string, InventoryGroupSummary>(alreadyCollapsed);
  for (const productKey of productOrder) {
    if (mensByKey.has(productKey)) continue;
    const sizeGroups = byProduct.get(productKey);
    if (!sizeGroups?.length) continue;
    const sorted = [...sizeGroups].sort((a, b) =>
      String(a.size || "").localeCompare(String(b.size || ""), undefined, { numeric: true }),
    );
    const primary = [...sorted].sort((a, b) =>
      b.newestCreatedAt.localeCompare(a.newestCreatedAt),
    )[0]!;
    const sizes: MensSizeSummary[] = sorted.map((g) => ({
      size: g.size || "—",
      groupKey: g.groupKey,
      primaryId: g.primaryId,
      primarySku: g.primarySku,
      totalQuantity: g.totalQuantity,
      availableQuantity: g.availableQuantity,
      rentedQuantity: g.rentedQuantity,
      maintenanceQuantity: g.maintenanceQuantity,
      inventoryGroupId: g.inventoryGroupId,
    }));
    const sizeLabel = sizes.map((s) => s.size).filter((s) => s && s !== "—").join(", ");
    mensByKey.set(productKey, {
      ...primary,
      groupKey: productKey,
      inventoryGroupId: null,
      size: sizeLabel,
      isMensProduct: true,
      sizes,
      totalQuantity: sizes.reduce((n, s) => n + s.totalQuantity, 0),
      availableQuantity: sizes.reduce((n, s) => n + s.availableQuantity, 0),
      rentedQuantity: sizes.reduce((n, s) => n + s.rentedQuantity, 0),
      maintenanceQuantity: sizes.reduce((n, s) => n + s.maintenanceQuantity, 0),
    });
  }

  const seenMens = new Set<string>();
  const merged: InventoryGroupSummary[] = [];
  for (const g of groups) {
    if (!isMensInventoryCategory(g.category)) {
      merged.push(g);
      continue;
    }
    const key =
      g.groupKey.startsWith("mens:") ? g.groupKey : mensProductGroupKey(g.baseName, g.category);
    if (seenMens.has(key)) continue;
    seenMens.add(key);
    const product = mensByKey.get(key);
    if (product) merged.push(product);
  }
  return merged;
}

export type InventoryListParams = {
  cursor?: string | null;
  limit?: number;
  q?: string;
  category?: string;
  subCategory?: string;
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

/** Name sort = category → sub-category → base name → group key. Newest keeps date order. */
type CursorPayload = {
  sort: "name" | "newest";
  v1: string;
  v2: string;
  v3?: string;
  v4?: string;
};

export function decodeCursor(raw?: string | null): CursorPayload | null {
  if (!raw?.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if ((parsed.sort === "name" || parsed.sort === "newest") && parsed.v1 && parsed.v2) {
      return {
        sort: parsed.sort,
        v1: parsed.v1,
        v2: parsed.v2,
        ...(parsed.v3 ? { v3: parsed.v3 } : {}),
        ...(parsed.v4 ? { v4: parsed.v4 } : {}),
      };
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
  const subCategory = (params.subCategory || "").trim();
  const status = (params.status || "").trim();
  const sortNewest = params.sort === "newest";
  const cursor = decodeCursor(params.cursor);

  // Men's are grouped by product (all sizes) inside the list query — paginate products, not sizes.
  const raw = !isSqliteDb()
    ? await listInventoryGroupsPostgres({
        limit,
        q,
        category,
        subCategory,
        status,
        sortNewest,
        cursor,
      })
    : await listInventoryGroupsPrismaFallback({
        limit,
        q,
        category,
        subCategory,
        status,
        sortNewest,
        cursor,
      });

  const groups = collapseMensProductGroups(raw.groups);
  return { groups, nextCursor: raw.nextCursor, rowCount: groups.length };
}

function summarizeGroup(
  groupKey: string,
  items: Array<{
    id: number;
    sku: string;
    name: string;
    category: string;
    subCategory?: string | null;
    size: string | null;
    color: string | null;
    status: string;
    dailyRate: number;
    photo?: string | null;
    thumbnailPhoto?: string | null;
    inventoryGroupId: string | null;
    createdAt: Date;
  }>,
): InventoryGroupSummary {
  const primary = [...items].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0]!;
  const thumb = primary.thumbnailPhoto || primary.photo;
  const full = primary.photo || primary.thumbnailPhoto;
  return {
    groupKey,
    inventoryGroupId: primary.inventoryGroupId,
    primaryId: primary.id,
    primarySku: primary.sku,
    baseName: stripUnitSuffix(primary.name),
    category: primary.category,
    subCategory: primary.subCategory || "Normal",
    size: primary.size || "",
    color: primary.color || "",
    totalQuantity: items.length,
    availableQuantity: items.filter((i) => i.status === "available").length,
    rentedQuantity: items.filter((i) => i.status === "rented").length,
    maintenanceQuantity: items.filter((i) => i.status === "maintenance").length,
    dailyRate: primary.dailyRate,
    thumbnailUrl: thumb ? photoUrl(thumb) : null,
    photoUrl: full ? photoUrl(full) : null,
    newestCreatedAt: primary.createdAt.toISOString(),
  };
}

function compareCategoryWise(a: InventoryGroupSummary, b: InventoryGroupSummary): number {
  const c = a.category.localeCompare(b.category);
  if (c !== 0) return c;
  const s = a.subCategory.localeCompare(b.subCategory);
  if (s !== 0) return s;
  const n = a.baseName.localeCompare(b.baseName);
  if (n !== 0) return n;
  return a.groupKey.localeCompare(b.groupKey);
}

function encodeNameSortCursor(g: InventoryGroupSummary): string {
  return encodeCursor({
    sort: "name",
    v1: g.category,
    v2: g.subCategory,
    v3: g.baseName,
    v4: g.groupKey,
  });
}

const ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  subCategory: true,
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
  subCategory: string;
  status: string;
  sortNewest: boolean;
  cursor: CursorPayload | null;
}): Promise<InventoryListResult> {
  const { limit, q, category, subCategory, status, sortNewest, cursor } = opts;

  if (q && looksLikeSku(q)) {
    const exact = await prisma.clothingItem.findFirst({
      where: {
        sku: { equals: q, mode: "insensitive" },
        ...(category ? { category } : {}),
        ...(subCategory
          ? subCategory === "Normal"
            ? { OR: [{ subCategory: "Normal" }, { subCategory: null }, { subCategory: "" }] }
            : { subCategory }
          : {}),
        ...(status ? { status } : {}),
      },
      select: ITEM_SELECT,
    });
    if (exact) {
      if (isMensInventoryCategory(exact.category)) {
        const matched = (
          await prisma.clothingItem.findMany({
            where: { category: exact.category },
            select: ITEM_SELECT,
            take: 300,
          })
        ).filter(
          (i) =>
            stripUnitSuffix(i.name).toLowerCase() ===
            stripUnitSuffix(exact.name).toLowerCase(),
        );
        const productKey = mensProductGroupKey(exact.name, exact.category);
        const collapsed = collapseMensProductGroups([
          ...Array.from(
            matched.reduce((map, item) => {
              const key = item.inventoryGroupId || inventoryFallbackGroupKey(item);
              const arr = map.get(key) || [];
              arr.push(item);
              map.set(key, arr);
              return map;
            }, new Map<string, typeof matched>()),
          ).map(([key, rows]) => summarizeGroup(key, rows)),
        ]);
        return {
          groups: collapsed,
          nextCursor: null,
          rowCount: collapsed.length,
        };
      }
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
  const cursorCategory = cursor?.sort === "name" ? cursor.v1 : "";
  const cursorSubCategory = cursor?.sort === "name" ? cursor.v2 : "";
  const cursorName = cursor?.sort === "name" ? cursor.v3 ?? "" : "";
  const cursorBaseName = cursor?.sort === "newest" ? cursor.v2 : "";
  const cursorKey =
    cursor?.sort === "newest" ? cursor.v3 ?? "" : cursor?.sort === "name" ? cursor.v4 ?? "" : "";
  const hasCursor = Boolean(cursor);
  const useNewest = sortNewest;

  const mensCategories = MENS_CATEGORIES.map((c) => c.toLowerCase());
  const rows = await prisma.$queryRaw<
    Array<{
      group_key: string;
      inventory_group_id: string | null;
      primary_id: number;
      primary_sku: string;
      base_name: string;
      category: string;
      sub_category: string;
      size: string;
      color: string;
      total_qty: number;
      available_qty: number;
      rented_qty: number;
      maintenance_qty: number;
      daily_rate: number;
      thumb_ref: string | null;
      photo_ref: string | null;
      newest_created_at: Date;
      is_mens: boolean;
      sizes_json: MensSizeSummary[] | null;
    }>
  >`
    WITH base AS (
      SELECT
        id,
        sku,
        name,
        category,
        COALESCE(NULLIF(TRIM(sub_category), ''), 'Normal') AS sub_category,
        COALESCE(size, '') AS size,
        COALESCE(color, '') AS color,
        status,
        daily_rate,
        photo,
        thumbnail_photo,
        inventory_group_id,
        created_at,
        regexp_replace(name, '\\s+#\\d+$', '') AS base_name,
        COALESCE(
          inventory_group_id,
          'legacy:' || regexp_replace(name, '\\s+#\\d+$', '') || '|' || category || '|' || COALESCE(size, '') || '|' || COALESCE(color, '')
        ) AS size_group_key,
        CASE
          WHEN lower(category) = ANY(${mensCategories}::text[])
          THEN 'mens:' || lower(regexp_replace(name, '\\s+#\\d+$', '')) || '|' || lower(category)
          ELSE COALESCE(
            inventory_group_id,
            'legacy:' || regexp_replace(name, '\\s+#\\d+$', '') || '|' || category || '|' || COALESCE(size, '') || '|' || COALESCE(color, '')
          )
        END AS list_group_key
      FROM clothing_items
      WHERE
        (${category} = '' OR category = ${category})
        AND (
          ${subCategory} = ''
          OR COALESCE(NULLIF(TRIM(sub_category), ''), 'Normal') = ${subCategory}
        )
        AND (
          ${q} = ''
          OR lower(name) LIKE '%' || lower(${q}) || '%'
          OR lower(sku) LIKE '%' || lower(${q}) || '%'
          OR lower(COALESCE(condition_notes, '')) LIKE '%' || lower(${q}) || '%'
        )
    ),
    size_agg AS (
      SELECT
        list_group_key,
        size,
        COALESCE(
          MAX(inventory_group_id),
          MAX(size_group_key)
        ) AS size_group_key,
        MAX(inventory_group_id) AS inventory_group_id,
        MAX(base_name) AS base_name,
        MAX(category) AS category,
        MAX(sub_category) AS sub_category,
        MAX(color) AS color,
        COUNT(*)::int AS total_qty,
        COUNT(*) FILTER (WHERE status = 'available')::int AS available_qty,
        COUNT(*) FILTER (WHERE status = 'rented')::int AS rented_qty,
        COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance_qty,
        MAX(daily_rate)::float AS daily_rate,
        MAX(created_at) AS newest_created_at,
        BOOL_OR(status = ${status}) AS status_match,
        (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1]::int AS primary_id,
        (ARRAY_AGG(sku ORDER BY created_at DESC, id DESC))[1] AS primary_sku,
        (ARRAY_AGG(COALESCE(thumbnail_photo, photo) ORDER BY created_at DESC, id DESC))[1] AS thumb_ref,
        (ARRAY_AGG(COALESCE(photo, thumbnail_photo) ORDER BY created_at DESC, id DESC))[1] AS photo_ref
      FROM base
      GROUP BY list_group_key, size
    ),
    list_agg AS (
      SELECT
        list_group_key AS group_key,
        BOOL_OR(list_group_key LIKE 'mens:%') AS is_mens,
        CASE
          WHEN BOOL_OR(list_group_key LIKE 'mens:%') THEN NULL
          ELSE MAX(inventory_group_id)
        END AS inventory_group_id,
        MAX(base_name) AS base_name,
        MAX(category) AS category,
        MAX(sub_category) AS sub_category,
        CASE
          WHEN BOOL_OR(list_group_key LIKE 'mens:%')
          THEN string_agg(NULLIF(size, ''), ', ' ORDER BY size)
          ELSE MAX(size)
        END AS size,
        MAX(color) AS color,
        SUM(total_qty)::int AS total_qty,
        SUM(available_qty)::int AS available_qty,
        SUM(rented_qty)::int AS rented_qty,
        SUM(maintenance_qty)::int AS maintenance_qty,
        MAX(daily_rate)::float AS daily_rate,
        MAX(newest_created_at) AS newest_created_at,
        BOOL_OR(status_match) AS status_match,
        (ARRAY_AGG(primary_id ORDER BY newest_created_at DESC, primary_id DESC))[1]::int AS primary_id,
        (ARRAY_AGG(primary_sku ORDER BY newest_created_at DESC, primary_id DESC))[1] AS primary_sku,
        (ARRAY_AGG(thumb_ref ORDER BY newest_created_at DESC, primary_id DESC))[1] AS thumb_ref,
        (ARRAY_AGG(photo_ref ORDER BY newest_created_at DESC, primary_id DESC))[1] AS photo_ref,
        CASE
          WHEN BOOL_OR(list_group_key LIKE 'mens:%') THEN
            json_agg(
              json_build_object(
                'size', size,
                'groupKey', size_group_key,
                'primaryId', primary_id,
                'primarySku', primary_sku,
                'totalQuantity', total_qty,
                'availableQuantity', available_qty,
                'rentedQuantity', rented_qty,
                'maintenanceQuantity', maintenance_qty,
                'inventoryGroupId', inventory_group_id
              )
              ORDER BY size
            )
          ELSE NULL
        END AS sizes_json
      FROM size_agg
      GROUP BY list_group_key
    )
    SELECT *
    FROM list_agg
    WHERE (${status} = '' OR status_match)
      AND (
        NOT ${hasCursor}
        OR (
          ${useNewest}
          AND (
            newest_created_at < ${cursorTs}::timestamptz
            OR (
              newest_created_at = ${cursorTs}::timestamptz
              AND (
                base_name > ${cursorBaseName}
                OR (base_name = ${cursorBaseName} AND group_key > ${cursorKey})
              )
            )
          )
        )
        OR (
          NOT ${useNewest}
          AND (
            category > ${cursorCategory}
            OR (
              category = ${cursorCategory}
              AND sub_category > ${cursorSubCategory}
            )
            OR (
              category = ${cursorCategory}
              AND sub_category = ${cursorSubCategory}
              AND base_name > ${cursorName}
            )
            OR (
              category = ${cursorCategory}
              AND sub_category = ${cursorSubCategory}
              AND base_name = ${cursorName}
              AND group_key > ${cursorKey}
            )
          )
        )
      )
    ORDER BY
      CASE WHEN ${useNewest} THEN newest_created_at END DESC NULLS LAST,
      CASE WHEN NOT ${useNewest} THEN category END ASC NULLS LAST,
      CASE WHEN NOT ${useNewest} THEN sub_category END ASC NULLS LAST,
      base_name ASC,
      group_key ASC
    LIMIT ${limit + 1}
  `;

  const page = rows.slice(0, limit);
  const groups: InventoryGroupSummary[] = page.map((r) => {
    const sizes = Array.isArray(r.sizes_json)
      ? (r.sizes_json as MensSizeSummary[]).map((s) => ({
          size: String(s.size || "—"),
          groupKey: String(s.groupKey || ""),
          primaryId: Number(s.primaryId) || 0,
          primarySku: String(s.primarySku || ""),
          totalQuantity: Number(s.totalQuantity) || 0,
          availableQuantity: Number(s.availableQuantity) || 0,
          rentedQuantity: Number(s.rentedQuantity) || 0,
          maintenanceQuantity: Number(s.maintenanceQuantity) || 0,
          inventoryGroupId: s.inventoryGroupId ? String(s.inventoryGroupId) : null,
        }))
      : undefined;
    return {
      groupKey: r.group_key,
      inventoryGroupId: r.inventory_group_id,
      primaryId: r.primary_id,
      primarySku: r.primary_sku,
      baseName: r.base_name,
      category: r.category,
      subCategory: r.sub_category || "Normal",
      size: r.size || "",
      color: r.color,
      totalQuantity: r.total_qty,
      availableQuantity: r.available_qty,
      rentedQuantity: r.rented_qty,
      maintenanceQuantity: r.maintenance_qty,
      dailyRate: Number(r.daily_rate) || 0,
      thumbnailUrl: r.thumb_ref ? photoUrl(r.thumb_ref) : null,
      photoUrl: r.photo_ref ? photoUrl(r.photo_ref) : null,
      newestCreatedAt: new Date(r.newest_created_at).toISOString(),
      ...(r.is_mens
        ? {
            isMensProduct: true,
            sizes: sizes || [],
          }
        : {}),
    };
  });

  let nextCursor: string | null = null;
  if (rows.length > limit && groups.length) {
    const last = groups[groups.length - 1]!;
    nextCursor = sortNewest
      ? encodeCursor({
          sort: "newest",
          v1: last.newestCreatedAt,
          v2: last.baseName,
          v3: last.groupKey,
        })
      : encodeNameSortCursor(last);
  }

  return { groups, nextCursor, rowCount: groups.length };
}

/** Prisma fallback (SQLite / when raw SQL unavailable). */
async function listInventoryGroupsPrismaFallback(opts: {
  limit: number;
  q: string;
  category: string;
  subCategory: string;
  status: string;
  sortNewest: boolean;
  cursor: CursorPayload | null;
}): Promise<InventoryListResult> {
  const items = await prisma.clothingItem.findMany({
    where: {
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.subCategory
        ? opts.subCategory === "Normal"
          ? { OR: [{ subCategory: "Normal" }, { subCategory: null }, { subCategory: "" }] }
          : { subCategory: opts.subCategory }
        : {}),
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
      : [{ category: "asc" }, { subCategory: "asc" }, { name: "asc" }],
    take: 500,
  });

  const map = new Map<string, typeof items>();
  for (const item of items) {
    const key = isMensInventoryCategory(item.category)
      ? mensProductGroupKey(item.name, item.category)
      : item.inventoryGroupId || inventoryFallbackGroupKey(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }

  let groups = Array.from(map.entries())
    .filter(([, rows]) => !opts.status || rows.some((row) => row.status === opts.status))
    .filter(([, rows]) => {
      if (!opts.subCategory) return true;
      return rows.some((row) => (row.subCategory || "Normal") === opts.subCategory);
    })
    .map(([key, rows]) => {
      const summary = summarizeGroup(key, rows);
      if (!isMensInventoryCategory(summary.category)) return summary;
      const bySize = new Map<string, typeof rows>();
      for (const row of rows) {
        const size = String(row.size || "").trim() || "—";
        const list = bySize.get(size) || [];
        list.push(row);
        bySize.set(size, list);
      }
      const sizes: MensSizeSummary[] = Array.from(bySize.entries())
        .map(([size, sizeRows]) => {
          const primary = [...sizeRows].sort((a, b) => b.id - a.id)[0]!;
          return {
            size,
            groupKey: primary.inventoryGroupId || inventoryFallbackGroupKey(primary),
            primaryId: primary.id,
            primarySku: primary.sku,
            totalQuantity: sizeRows.length,
            availableQuantity: sizeRows.filter((r) => r.status === "available").length,
            rentedQuantity: sizeRows.filter((r) => r.status === "rented").length,
            maintenanceQuantity: sizeRows.filter((r) => r.status === "maintenance").length,
            inventoryGroupId: primary.inventoryGroupId,
          };
        })
        .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }));
      return {
        ...summary,
        groupKey: key,
        inventoryGroupId: null,
        size: sizes.map((s) => s.size).filter((s) => s !== "—").join(", "),
        isMensProduct: true,
        sizes,
      };
    });
  groups.sort((a, b) => {
    if (opts.sortNewest) {
      const t = b.newestCreatedAt.localeCompare(a.newestCreatedAt);
      if (t !== 0) return t;
      const n = a.baseName.localeCompare(b.baseName);
      if (n !== 0) return n;
      return a.groupKey.localeCompare(b.groupKey);
    }
    return compareCategoryWise(a, b);
  });

  if (opts.cursor) {
    if (opts.cursor.sort === "newest") {
      const cursorKey = opts.cursor.v3;
      const idx = cursorKey ? groups.findIndex((g) => g.groupKey === cursorKey) : -1;
      if (idx >= 0) groups = groups.slice(idx + 1);
    } else {
      const cursorGroup: InventoryGroupSummary = {
        groupKey: opts.cursor.v4 || opts.cursor.v2,
        inventoryGroupId: null,
        primaryId: 0,
        primarySku: "",
        baseName: opts.cursor.v3 || opts.cursor.v1,
        category: opts.cursor.v3 ? opts.cursor.v1 : "",
        subCategory: opts.cursor.v3 ? opts.cursor.v2 : "",
        size: "",
        color: "",
        totalQuantity: 0,
        availableQuantity: 0,
        rentedQuantity: 0,
        maintenanceQuantity: 0,
        dailyRate: 0,
        thumbnailUrl: null,
        photoUrl: null,
        newestCreatedAt: "",
      };
      // New cursors have v3 (base name) + v4 (group key). Legacy name cursors only had name+key.
      if (opts.cursor.v3 && opts.cursor.v4) {
        groups = groups.filter((g) => compareCategoryWise(g, cursorGroup) > 0);
      } else {
        const idx = groups.findIndex((g) => g.groupKey === opts.cursor!.v2);
        if (idx >= 0) groups = groups.slice(idx + 1);
      }
    }
  }

  const page = groups.slice(0, opts.limit);
  const nextCursor =
    groups.length > opts.limit && page.length
      ? opts.sortNewest
        ? encodeCursor({
            sort: "newest",
            v1: page[page.length - 1]!.newestCreatedAt,
            v2: page[page.length - 1]!.baseName,
            v3: page[page.length - 1]!.groupKey,
          })
        : encodeNameSortCursor(page[page.length - 1]!)
      : null;

  return { groups: page, nextCursor, rowCount: page.length };
}

export async function listInventoryGroupItems(groupKey: string) {
  const mens = parseMensProductGroupKey(groupKey);
  if (mens) {
    const items = await prisma.clothingItem.findMany({
      where: {
        category: {
          equals: mens.category,
          mode: "insensitive",
        },
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
        thumbnailPhoto: true,
        inventoryGroupId: true,
      },
      orderBy: [{ size: "asc" }, { name: "asc" }],
      take: 200,
    });
    return items.filter(
      (i) =>
        isMensInventoryCategory(i.category) &&
        stripUnitSuffix(i.name).toLowerCase() === mens.baseName.toLowerCase(),
    );
  }

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
      thumbnailPhoto: true,
    },
    orderBy: { name: "asc" },
    take: 100,
  });
}

/** All size rows for a men's product (for Manage Inventory accordion). */
export async function listMensProductSizes(baseName: string, category: string) {
  if (!isMensInventoryCategory(category)) return [];
  const items = await prisma.clothingItem.findMany({
    where: { category },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      size: true,
      status: true,
      dailyRate: true,
      inventoryGroupId: true,
      createdAt: true,
      photo: true,
      thumbnailPhoto: true,
    },
    orderBy: [{ size: "asc" }, { id: "asc" }],
    take: 300,
  });
  const matched = items.filter(
    (i) => stripUnitSuffix(i.name).toLowerCase() === stripUnitSuffix(baseName).toLowerCase(),
  );
  const bySize = new Map<string, typeof matched>();
  for (const row of matched) {
    const size = String(row.size || "").trim() || "—";
    const list = bySize.get(size) || [];
    list.push(row);
    bySize.set(size, list);
  }
  return Array.from(bySize.entries())
    .map(([size, rows]) => {
      const primary = [...rows].sort((a, b) => b.id - a.id)[0]!;
      const groupKey =
        primary.inventoryGroupId ||
        inventoryFallbackGroupKey({
          name: primary.name,
          category: primary.category,
          size: primary.size,
          color: "",
        });
      return {
        size,
        groupKey,
        primaryId: primary.id,
        primarySku: primary.sku,
        totalQuantity: rows.length,
        availableQuantity: rows.filter((r) => r.status === "available").length,
        rentedQuantity: rows.filter((r) => r.status === "rented").length,
        maintenanceQuantity: rows.filter((r) => r.status === "maintenance").length,
        inventoryGroupId: primary.inventoryGroupId,
        dailyRate: primary.dailyRate,
      } satisfies MensSizeSummary & { dailyRate: number };
    })
    .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }));
}
