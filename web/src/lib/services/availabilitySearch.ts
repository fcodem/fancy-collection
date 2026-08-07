import { Prisma } from "@prisma/client";
import prisma, { parseDateQ } from "@/lib/prisma";
import { dressDisplayName, stripUnitSuffix } from "@/lib/dress";
import {
  decodeAvailabilityCursor,
  encodeAvailabilityCursor,
} from "@/lib/availabilityCursor";
import type { JewelleryPartKey } from "@/lib/jewelleryParts";
import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";
import { photoUrl } from "@/lib/photoUrl";

function freeItemGroupKey(item: {
  inventoryGroupId?: string | null;
  name: string;
  category: string;
  size?: string | null;
  color?: string | null;
}): string {
  // Always include size so shared legacy inventory_group_id values cannot merge sizes.
  if (item.inventoryGroupId) {
    return `g:${item.inventoryGroupId}|${item.size || ""}`;
  }
  return `legacy:${stripUnitSuffix(item.name)}|${item.category}|${item.size || ""}|${item.color || ""}`;
}

export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 50;
export const CANDIDATE_CAP = 500;

export type AvailabilitySearchOpts = {
  deliveryDate: string;
  returnDate: string;
  excludeBookingId?: number;
  category?: string;
  subCategory?: string;
  size?: string;
  itemType?: string;
  group?: string;
  status?: string;
  search?: string;
  cursor?: string | null;
  limit?: number;
  includeTotal?: boolean;
};

export type AvailabilitySearchAudit = {
  queryMs: number;
  serializeMs: number;
  candidateCap: number;
  jewelleryChecks: boolean;
  total?: number;
};

export type AvailabilitySearchResult = {
  free_items: Array<{
    id: number;
    name: string;
    display_name: string;
    category: string;
    sub_category: string;
    size: string;
    color: string;
    status: string;
    item_type: string;
    thumbnail: string | null;
    photo: string | null;
    inventory_group_id: string | null;
    free_quantity: number;
    total_quantity: number;
    has_necklace: boolean;
    has_earrings: boolean;
    has_teeka: boolean;
    has_pasa: boolean;
    booked_parts: JewelleryPartKey[];
    available_parts: JewelleryPartKey[];
    returning_warning: Record<string, unknown> | null;
    booked_warning: Record<string, unknown> | null;
  }>;
  returning_on_delivery: Array<Record<string, unknown>>;
  booked_on_return: Array<Record<string, unknown>>;
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
  total?: number;
  audit: AvailabilitySearchAudit;
};

type AvailabilityRow = {
  id: number;
  name: string;
  category: string;
  subCategory: string | null;
  size: string | null;
  color: string | null;
  status: string;
  itemType: string;
  thumbnail: string | null;
  inventoryGroupId: string | null;
  hasNecklace: boolean;
  hasEarrings: boolean;
  hasTeeka: boolean;
  hasPasa: boolean;
  hasSheeshpatti: boolean;
  hasNath: boolean;
  hasHathfool: boolean;
  hasKamarband: boolean;
  hasRings: boolean;
  hasLongHar: boolean;
  necklaceBusy: boolean;
  earringsBusy: boolean;
  teekaBusy: boolean;
  pasaBusy: boolean;
  sheeshpattiBusy: boolean;
  nathBusy: boolean;
  hathfoolBusy: boolean;
  kamarbandBusy: boolean;
  ringsBusy: boolean;
  longHarBusy: boolean;
  wholeJewelleryBusy: boolean;
  returningWarning: Record<string, unknown> | null;
  bookedWarning: Record<string, unknown> | null;
};

export function candidateCapFor(limit: number): number {
  return Math.min(CANDIDATE_CAP, Math.max(50, (limit + 1) * 25));
}

export function needsJewelleryOccupancy(
  opts: Pick<AvailabilitySearchOpts, "group" | "itemType" | "category">,
): boolean {
  const group = opts.group?.trim() || "";
  const itemType = opts.itemType?.trim() || "";
  const category = opts.category?.trim() || "";

  if (group === "men" || group === "women") return false;
  if (itemType && itemType !== "jewellery") return false;
  if (group === "jewellery" || group === "bridal") return true;
  if (itemType === "jewellery") return true;
  if (category) {
    if (category === "Bridal Jewellery") return true;
    return BASE_JEWELLERY.includes(category);
  }
  return true;
}

function availabilityBookingWarnJson(alias: string) {
  return Prisma.sql`CASE WHEN ${Prisma.raw(alias)}.id IS NULL THEN NULL ELSE jsonb_build_object(
    'booking_id', ${Prisma.raw(alias)}.id,
    'serial_no', ${Prisma.raw(alias)}.monthly_serial,
    'customer_name', ${Prisma.raw(alias)}.customer_name,
    'customer_address', COALESCE(${Prisma.raw(alias)}.customer_address, ''),
    'contact_1', COALESCE(${Prisma.raw(alias)}.contact_1, ''),
    'whatsapp_no', COALESCE(${Prisma.raw(alias)}.whatsapp_no, ''),
    'venue', COALESCE(${Prisma.raw(alias)}.venue, ''),
    'staff_names', COALESCE(${Prisma.raw(alias)}.staff_names, ''),
    'total_advance', COALESCE(${Prisma.raw(alias)}.total_advance, ${Prisma.raw(alias)}.advance, 0),
    'total_rent', COALESCE(${Prisma.raw(alias)}.total_price, ${Prisma.raw(alias)}.price, 0),
    'dress_names', COALESCE(
      (SELECT string_agg(bi.dress_name, ', ' ORDER BY bi.id)
       FROM booking_items bi
       WHERE bi.booking_id = ${Prisma.raw(alias)}.id AND bi.is_cancelled = false),
      COALESCE(${Prisma.raw(alias)}.dress_name, '')
    ),
    'item_notes', COALESCE(${Prisma.raw(alias)}.notes, ''),
    'common_notes', COALESCE(${Prisma.raw(alias)}.common_notes, ''),
    'delivery_date', to_char(${Prisma.raw(alias)}.delivery_date, 'DD/MM/YYYY'),
    'delivery_time', COALESCE(${Prisma.raw(alias)}.delivery_time, ''),
    'return_date', to_char(${Prisma.raw(alias)}.return_date, 'DD/MM/YYYY'),
    'return_time', COALESCE(${Prisma.raw(alias)}.return_time, ''),
    'booking_date', to_char((${Prisma.raw(alias)}.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'),
    'booking_time', to_char((${Prisma.raw(alias)}.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM')
  ) END`;
}

function warningShape(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return {
    booking_id: raw.booking_id as number | undefined,
    serial_no: Number(raw.serial_no ?? 0),
    customer_name: String(raw.customer_name ?? ""),
    customer_address: String(raw.customer_address ?? ""),
    contact_1: String(raw.contact_1 ?? ""),
    whatsapp_no: String(raw.whatsapp_no ?? ""),
    venue: String(raw.venue ?? ""),
    staff_names: String(raw.staff_names ?? ""),
    total_advance: Number(raw.total_advance ?? 0),
    total_rent: Number(raw.total_rent ?? 0),
    dress_names: String(raw.dress_names ?? ""),
    item_notes: String(raw.item_notes ?? ""),
    common_notes: String(raw.common_notes ?? ""),
    delivery_date: String(raw.delivery_date ?? ""),
    delivery_time: String(raw.delivery_time ?? ""),
    return_date: String(raw.return_date ?? ""),
    return_time: String(raw.return_time ?? ""),
    booking_date: String(raw.booking_date ?? ""),
    booking_time: String(raw.booking_time ?? ""),
    security_deposit: 0,
    customer: raw.customer_name,
    contact: raw.contact_1,
  };
}

function partsFor(row: AvailabilityRow, busy: boolean): JewelleryPartKey[] {
  const parts: JewelleryPartKey[] = [];
  if (row.hasNecklace && row.necklaceBusy === busy) parts.push("necklace");
  if (row.hasEarrings && row.earringsBusy === busy) parts.push("earrings");
  if (row.hasTeeka && row.teekaBusy === busy) parts.push("teeka");
  if (row.hasPasa && row.pasaBusy === busy) parts.push("pasa");
  if (row.hasSheeshpatti && row.sheeshpattiBusy === busy) parts.push("sheeshpatti");
  if (row.hasNath && row.nathBusy === busy) parts.push("nath");
  if (row.hasHathfool && row.hathfoolBusy === busy) parts.push("hathfool");
  if (row.hasKamarband && row.kamarbandBusy === busy) parts.push("kamarband");
  if (row.hasRings && row.ringsBusy === busy) parts.push("rings");
  if (row.hasLongHar && row.longHarBusy === busy) parts.push("longhar");
  return parts;
}

function buildAvailabilityQuery(opts: {
  deliveryStart: Date;
  returnStart: Date;
  returnEnd: Date;
  limit: number;
  candidateCap: number;
  jewelleryChecks: boolean;
  category: string;
  subCategory: string;
  size: string;
  itemType: string;
  group: string;
  status: string;
  search: string;
  excludeId: number | null;
  cursorSql: Prisma.Sql;
  groupSql: Prisma.Sql;
  finalLimitSql: Prisma.Sql;
}) {
  const {
    deliveryStart,
    returnStart,
    returnEnd,
    candidateCap,
    jewelleryChecks,
    category,
    subCategory,
    size,
    itemType,
    groupSql,
    status,
    search,
    excludeId,
    cursorSql,
    finalLimitSql,
  } = opts;

  const jewelleryBookingBoundariesCte = jewelleryChecks
    ? Prisma.sql`
        jewellery_booking_boundaries AS (
          SELECT
            bj.item_id,
            b.id AS booking_id,
            CASE
              WHEN (b.return_date AT TIME ZONE 'UTC')::date = (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'returning'
              WHEN (b.delivery_date AT TIME ZONE 'UTC')::date = (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'booked'
              ELSE 'busy'
            END AS occupancy_kind
          FROM booking_jewellery bj
          JOIN bookings b ON b.id = bj.booking_id
          JOIN candidate_inventory ci ON ci.id = bj.item_id
          WHERE bj.status = 'active'
            AND b.status IN ('booked', 'delivered')
            AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
            AND b.delivery_date < ${returnEnd}
            AND b.return_date >= ${deliveryStart}
        ),`
    : Prisma.sql`
        jewellery_booking_boundaries AS (
          SELECT
            NULL::int AS item_id,
            NULL::int AS booking_id,
            NULL::text AS occupancy_kind
          WHERE false
        ),`;

  const jewelleryPartOccupancyCte = jewelleryChecks
    ? Prisma.sql`
        jewellery_part_occupancy AS (
          SELECT
            bj.item_id,
            BOOL_OR(bj.pick_necklace) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS necklace_busy,
            BOOL_OR(bj.pick_earrings) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS earrings_busy,
            BOOL_OR(bj.pick_teeka) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS teeka_busy,
            BOOL_OR(bj.pick_pasa) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS pasa_busy,
            BOOL_OR(bj.pick_sheeshpatti) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS sheeshpatti_busy,
            BOOL_OR(bj.pick_nath) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS nath_busy,
            BOOL_OR(bj.pick_hathfool) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS hathfool_busy,
            BOOL_OR(bj.pick_kamarband) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS kamarband_busy,
            BOOL_OR(bj.pick_rings) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS rings_busy,
            BOOL_OR(bj.pick_long_har) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS long_har_busy,
            BOOL_OR(
              NOT bj.pick_necklace AND NOT bj.pick_earrings
              AND NOT bj.pick_teeka AND NOT bj.pick_pasa
              AND NOT bj.pick_sheeshpatti AND NOT bj.pick_nath
              AND NOT bj.pick_hathfool AND NOT bj.pick_kamarband
              AND NOT bj.pick_rings AND NOT bj.pick_long_har
            ) FILTER (
              WHERE (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
                AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
            ) AS whole_busy
          FROM booking_jewellery bj
          JOIN bookings b ON b.id = bj.booking_id
          JOIN candidate_inventory ci ON ci.id = bj.item_id
          WHERE bj.status = 'active'
            AND b.status IN ('booked', 'delivered')
            AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
            AND b.delivery_date < ${returnEnd}
            AND b.return_date >= ${deliveryStart}
          GROUP BY bj.item_id
        ),`
    : Prisma.sql`
        jewellery_part_occupancy AS (
          SELECT
            NULL::int AS item_id,
            false AS necklace_busy,
            false AS earrings_busy,
            false AS teeka_busy,
            false AS pasa_busy,
            false AS sheeshpatti_busy,
            false AS nath_busy,
            false AS hathfool_busy,
            false AS kamarband_busy,
            false AS rings_busy,
            false AS long_har_busy,
            false AS whole_busy
          WHERE false
        ),`;

  return Prisma.sql`
    WITH candidate_inventory AS (
      SELECT
        ci.id,
        ci.name,
        ci.category,
        ci.sub_category AS "subCategory",
        ci.size,
        ci.color,
        ci.status,
        ci.item_type AS "itemType",
        COALESCE(ci.thumbnail_photo, ci.photo) AS thumbnail,
        ci.inventory_group_id AS "inventoryGroupId",
        ci.has_necklace AS "hasNecklace",
        ci.has_earrings AS "hasEarrings",
        ci.has_teeka AS "hasTeeka",
        ci.has_pasa AS "hasPasa",
        ci.has_sheeshpatti AS "hasSheeshpatti",
        ci.has_nath AS "hasNath",
        ci.has_hathfool AS "hasHathfool",
        ci.has_kamarband AS "hasKamarband",
        ci.has_rings AS "hasRings",
        ci.has_long_har AS "hasLongHar"
      FROM clothing_items ci
      WHERE ci.status NOT IN ('maintenance', 'repair', 'cleaning')
        AND (${category} = '' OR ci.category = ${category})
        AND (${subCategory} = '' OR COALESCE(ci.sub_category, 'Normal') = ${subCategory})
        AND (${size} = '' OR COALESCE(ci.size, '') = ${size})
        AND (${itemType} = '' OR ci.item_type = ${itemType})
        ${groupSql}
        AND (${status} = '' OR ci.status = ${status})
        AND (
          ${search} = ''
          OR ci.name ILIKE ('%' || ${search} || '%')
          OR ci.sku = ${search}
        )
        ${cursorSql}
      ORDER BY ci.category, ci.name, COALESCE(ci.size, ''), ci.id
      LIMIT ${candidateCap}
    ),
    active_booking_occupancy AS (
      SELECT
        bi.item_id,
        b.id AS booking_id,
        CASE
          WHEN (b.return_date AT TIME ZONE 'UTC')::date = (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'returning'
          WHEN (b.delivery_date AT TIME ZONE 'UTC')::date = (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'booked'
          ELSE 'busy'
        END AS occupancy_kind
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN candidate_inventory ci ON ci.id = bi.item_id
      WHERE b.status IN ('booked', 'delivered')
        AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
        AND b.delivery_date < ${returnEnd}
        AND b.return_date >= ${deliveryStart}
        AND bi.item_id IS NOT NULL
        AND bi.is_cancelled = false
        AND bi.is_returned = false
    ),
    legacy_booking_occupancy AS (
      SELECT
        b.item_id,
        b.id AS booking_id,
        CASE
          WHEN (b.return_date AT TIME ZONE 'UTC')::date = (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'returning'
          WHEN (b.delivery_date AT TIME ZONE 'UTC')::date = (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date THEN 'booked'
          ELSE 'busy'
        END AS occupancy_kind
      FROM bookings b
      JOIN candidate_inventory ci ON ci.id = b.item_id
      WHERE b.status IN ('booked', 'delivered')
        AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
        AND b.delivery_date < ${returnEnd}
        AND b.return_date >= ${deliveryStart}
        AND b.item_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM booking_items bi
          WHERE bi.booking_id = b.id
            AND bi.item_id = b.item_id
            AND bi.is_cancelled = false
            AND bi.is_returned = false
        )
    ),
    ${jewelleryBookingBoundariesCte}
    same_day_return_warnings AS (
      SELECT item_id, MIN(booking_id) AS booking_id
      FROM (
        SELECT * FROM active_booking_occupancy
        UNION ALL
        SELECT * FROM legacy_booking_occupancy
        UNION ALL
        SELECT * FROM jewellery_booking_boundaries
      ) o
      WHERE occupancy_kind = 'returning'
      GROUP BY item_id
    ),
    same_day_delivery_warnings AS (
      SELECT item_id, MIN(booking_id) AS booking_id
      FROM (
        SELECT * FROM active_booking_occupancy
        UNION ALL
        SELECT * FROM legacy_booking_occupancy
        UNION ALL
        SELECT * FROM jewellery_booking_boundaries
      ) o
      WHERE occupancy_kind = 'booked'
      GROUP BY item_id
    ),
    busy_booking_items AS (
      SELECT DISTINCT item_id
      FROM (
        SELECT * FROM active_booking_occupancy
        UNION ALL
        SELECT * FROM legacy_booking_occupancy
      ) o
      WHERE occupancy_kind = 'busy'
    ),
    rental_occupancy AS (
      SELECT DISTINCT ri.item_id
      FROM rentals r
      JOIN rental_items ri ON ri.rental_id = r.id
      JOIN candidate_inventory ci ON ci.id = ri.item_id
      WHERE r.status IN ('active', 'overdue')
        AND r.start_date < ${returnEnd}
        AND r.end_date >= ${deliveryStart}
        AND ri.item_id IS NOT NULL
    ),
    ${jewelleryPartOccupancyCte}
    final_availability AS (
      SELECT ci.*
      FROM candidate_inventory ci
      LEFT JOIN busy_booking_items busy ON busy.item_id = ci.id
      LEFT JOIN rental_occupancy rental ON rental.item_id = ci.id
      LEFT JOIN jewellery_part_occupancy jew ON jew.item_id = ci.id
      WHERE rental.item_id IS NULL
        AND busy.item_id IS NULL
        AND (
          ci."itemType" <> 'jewellery'
          OR COALESCE(jew.whole_busy, false) = false
        )
        AND (
          ci."itemType" <> 'jewellery'
          OR NOT (
            (NOT ci."hasNecklace" OR COALESCE(jew.necklace_busy, false))
            AND (NOT ci."hasEarrings" OR COALESCE(jew.earrings_busy, false))
            AND (NOT ci."hasTeeka" OR COALESCE(jew.teeka_busy, false))
            AND (NOT ci."hasPasa" OR COALESCE(jew.pasa_busy, false))
            AND (NOT ci."hasSheeshpatti" OR COALESCE(jew.sheeshpatti_busy, false))
            AND (NOT ci."hasNath" OR COALESCE(jew.nath_busy, false))
            AND (NOT ci."hasHathfool" OR COALESCE(jew.hathfool_busy, false))
            AND (NOT ci."hasKamarband" OR COALESCE(jew.kamarband_busy, false))
            AND (NOT ci."hasRings" OR COALESCE(jew.rings_busy, false))
            AND (NOT ci."hasLongHar" OR COALESCE(jew.long_har_busy, false))
          )
        )
      ORDER BY ci.category, ci.name, COALESCE(ci.size, ''), ci.id
      ${finalLimitSql}
    )
  `;
}

export async function searchAvailableItems(
  opts: AvailabilitySearchOpts,
): Promise<AvailabilitySearchResult> {
  const deliveryStart = parseDateQ(opts.deliveryDate);
  const returnStart = parseDateQ(opts.returnDate);
  const returnEnd = new Date(returnStart.getTime() + 86_400_000);
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit || DEFAULT_LIMIT));
  const candidateCap = candidateCapFor(limit);
  const jewelleryChecks = needsJewelleryOccupancy(opts);
  const cursor = decodeAvailabilityCursor(opts.cursor);
  const category = opts.category?.trim() || "";
  const subCategory = opts.subCategory?.trim() || "";
  const size = opts.size?.trim() || "";
  const itemType = opts.itemType?.trim() || "";
  const group = opts.group?.trim() || "";
  const status = opts.status?.trim() || "";
  const search = opts.search?.trim() || "";
  const excludeId = opts.excludeBookingId ?? null;
  const cursorSql = cursor
    ? typeof cursor.size === "string"
      ? Prisma.sql`AND (
          ci.category > ${cursor.category}
          OR (ci.category = ${cursor.category} AND ci.name > ${cursor.name})
          OR (
            ci.category = ${cursor.category}
            AND ci.name = ${cursor.name}
            AND COALESCE(ci.size, '') > ${cursor.size}
          )
          OR (
            ci.category = ${cursor.category}
            AND ci.name = ${cursor.name}
            AND COALESCE(ci.size, '') = ${cursor.size}
            AND ci.id > ${cursor.id}
          )
        )`
      : Prisma.sql`AND (
          ci.category > ${cursor.category}
          OR (ci.category = ${cursor.category} AND ci.name > ${cursor.name})
          OR (ci.category = ${cursor.category} AND ci.name = ${cursor.name} AND ci.id > ${cursor.id})
        )`
    : Prisma.empty;
  const groupSql =
    group === "men"
      ? Prisma.sql`AND ci.category IN (${Prisma.join(BASE_MENS)})`
      : group === "women"
        ? Prisma.sql`AND ci.category IN (${Prisma.join(BASE_WOMENS)})`
        : group === "jewellery"
          ? Prisma.sql`AND ci.category IN (${Prisma.join(BASE_JEWELLERY)}) AND ci.category <> 'Bridal Jewellery'`
          : group === "bridal"
            ? Prisma.sql`AND ci.category = 'Bridal Jewellery'`
            : Prisma.empty;

  const sharedQuery = buildAvailabilityQuery({
    deliveryStart,
    returnStart,
    returnEnd,
    limit,
    candidateCap,
    jewelleryChecks,
    category,
    subCategory,
    size,
    itemType,
    group,
    status,
    search,
    excludeId,
    cursorSql,
    groupSql,
    finalLimitSql: Prisma.sql`LIMIT ${limit + 1}`,
  });

  const queryStart = performance.now();
  const rows = await prisma.$queryRaw<AvailabilityRow[]>`
    ${sharedQuery}
    SELECT
      fa.*,
      COALESCE(jew.necklace_busy, false) AS "necklaceBusy",
      COALESCE(jew.earrings_busy, false) AS "earringsBusy",
      COALESCE(jew.teeka_busy, false) AS "teekaBusy",
      COALESCE(jew.pasa_busy, false) AS "pasaBusy",
      COALESCE(jew.sheeshpatti_busy, false) AS "sheeshpattiBusy",
      COALESCE(jew.nath_busy, false) AS "nathBusy",
      COALESCE(jew.hathfool_busy, false) AS "hathfoolBusy",
      COALESCE(jew.kamarband_busy, false) AS "kamarbandBusy",
      COALESCE(jew.rings_busy, false) AS "ringsBusy",
      COALESCE(jew.long_har_busy, false) AS "longHarBusy",
      COALESCE(jew.whole_busy, false) AS "wholeJewelleryBusy",
      ${availabilityBookingWarnJson("rb")} AS "returningWarning",
      ${availabilityBookingWarnJson("bb")} AS "bookedWarning"
    FROM final_availability fa
    LEFT JOIN jewellery_part_occupancy jew ON jew.item_id = fa.id
    LEFT JOIN same_day_return_warnings rw ON rw.item_id = fa.id
    LEFT JOIN bookings rb ON rb.id = rw.booking_id
    LEFT JOIN same_day_delivery_warnings bw ON bw.item_id = fa.id
    LEFT JOIN bookings bb ON bb.id = bw.booking_id
    ORDER BY fa.category, fa.name, COALESCE(fa.size, ''), fa.id
  `;
  const queryMs = Math.round(performance.now() - queryStart);

  let total: number | undefined;
  if (opts.includeTotal) {
    const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      ${sharedQuery}
      SELECT COUNT(*)::bigint AS count FROM final_availability
    `;
    total = Number(countRows[0]?.count ?? 0);
  }

  const serializeStart = performance.now();
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);

  const freeCountByGroup = new Map<string, number>();
  for (const row of visible) {
    const key = freeItemGroupKey(row);
    freeCountByGroup.set(key, (freeCountByGroup.get(key) || 0) + 1);
  }

  const groupIds = [
    ...new Set(visible.map((r) => r.inventoryGroupId).filter((id): id is string => Boolean(id))),
  ];
  const totalByGroupId = new Map<string, number>();
  if (groupIds.length) {
    const totals = await prisma.clothingItem.groupBy({
      by: ["inventoryGroupId"],
      where: {
        inventoryGroupId: { in: groupIds },
        status: { notIn: ["maintenance", "repair", "cleaning"] },
      },
      _count: { _all: true },
    });
    for (const row of totals) {
      if (row.inventoryGroupId) totalByGroupId.set(row.inventoryGroupId, row._count._all);
    }
  }

  // Legacy multi-unit rows (no inventory_group_id): count siblings by base name + attrs.
  const legacyKeys = [
    ...new Set(
      visible
        .filter((r) => !r.inventoryGroupId)
        .map((r) => freeItemGroupKey(r)),
    ),
  ];
  const totalByLegacyKey = new Map<string, number>();
  if (legacyKeys.length) {
    for (const key of legacyKeys) {
      const freeInPage = freeCountByGroup.get(key) || 1;
      const sample = visible.find((r) => freeItemGroupKey(r) === key);
      if (!sample) {
        totalByLegacyKey.set(key, freeInPage);
        continue;
      }
      const base = stripUnitSuffix(sample.name);
      const siblings = await prisma.clothingItem.findMany({
        where: {
          inventoryGroupId: null,
          category: sample.category,
          size: sample.size || "",
          color: sample.color || "",
          status: { notIn: ["maintenance", "repair", "cleaning"] },
          OR: [{ name: base }, { name: { startsWith: `${base} #` } }],
        },
        select: { name: true },
        take: 100,
      });
      const matched = siblings.filter((s) => stripUnitSuffix(s.name) === base).length;
      totalByLegacyKey.set(key, Math.max(matched || freeInPage, freeInPage));
    }
  }

  const free_items = visible.map((row) => {
    const isJewellery = jewelleryChecks && row.itemType === "jewellery";
    const thumb = row.thumbnail ? photoUrl(row.thumbnail) : null;
    const key = freeItemGroupKey(row);
    const freeQty = freeCountByGroup.get(key) || 1;
    const totalQty = row.inventoryGroupId
      ? totalByGroupId.get(row.inventoryGroupId) || freeQty
      : totalByLegacyKey.get(key) || freeQty;
    return {
      id: row.id,
      name: row.name,
      display_name: dressDisplayName(row.name, row.category, row.size),
      category: row.category,
      sub_category: row.subCategory || "Normal",
      size: row.size || "",
      color: row.color || "",
      status: row.status,
      item_type: row.itemType,
      thumbnail: thumb,
      photo: thumb,
      inventory_group_id: row.inventoryGroupId,
      free_quantity: freeQty,
      total_quantity: totalQty,
      has_necklace: row.hasNecklace,
      has_earrings: row.hasEarrings,
      has_teeka: row.hasTeeka,
      has_pasa: row.hasPasa,
      has_sheeshpatti: row.hasSheeshpatti,
      has_nath: row.hasNath,
      has_hathfool: row.hasHathfool,
      has_kamarband: row.hasKamarband,
      has_rings: row.hasRings,
      has_long_har: row.hasLongHar,
      booked_parts: isJewellery ? partsFor(row, true) : [],
      available_parts: isJewellery ? partsFor(row, false) : [],
      returning_warning: warningShape(row.returningWarning),
      booked_warning: warningShape(row.bookedWarning),
    };
  });
  const last = visible[visible.length - 1];
  const result: AvailabilitySearchResult = {
    free_items,
    returning_on_delivery: free_items
      .filter((item) => item.returning_warning)
      .map((item) => ({ item_id: item.id, ...item.returning_warning })),
    booked_on_return: free_items
      .filter((item) => item.booked_warning)
      .map((item) => ({ item_id: item.id, ...item.booked_warning })),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeAvailabilityCursor({
            category: last.category,
            name: last.name,
            size: last.size || "",
            id: last.id,
          })
        : null,
    limit,
    ...(total !== undefined ? { total } : {}),
    audit: {
      queryMs,
      serializeMs: 0,
      candidateCap,
      jewelleryChecks,
      ...(total !== undefined ? { total } : {}),
    },
  };
  result.audit.serializeMs = Math.round(performance.now() - serializeStart);
  return result;
}
