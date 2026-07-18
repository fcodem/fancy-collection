import { Prisma } from "@prisma/client";
import prisma, { parseDateQ } from "@/lib/prisma";
import { dressDisplayName } from "@/lib/dress";
import {
  decodeAvailabilityCursor,
  encodeAvailabilityCursor,
} from "@/lib/availabilityCursor";
import type { JewelleryPartKey } from "@/lib/jewelleryParts";
import { BASE_JEWELLERY, BASE_MENS, BASE_WOMENS } from "@/lib/constants";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

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
  hasNecklace: boolean;
  hasEarrings: boolean;
  hasTeeka: boolean;
  hasPasa: boolean;
  necklaceBusy: boolean;
  earringsBusy: boolean;
  teekaBusy: boolean;
  pasaBusy: boolean;
  wholeJewelleryBusy: boolean;
  returningWarning: Record<string, unknown> | null;
  bookedWarning: Record<string, unknown> | null;
};

function warningShape(raw: Record<string, unknown> | null) {
  if (!raw) return null;
  return {
    ...raw,
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
  return parts;
}

export async function searchAvailableItems(opts: {
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
}) {
  const deliveryStart = parseDateQ(opts.deliveryDate);
  const returnStart = parseDateQ(opts.returnDate);
  const returnEnd = new Date(returnStart.getTime() + 86_400_000);
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit || DEFAULT_LIMIT));
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
    ? Prisma.sql`AND (
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

  const rows = await prisma.$queryRaw<AvailabilityRow[]>`
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
        ci.thumbnail_photo AS thumbnail,
        ci.has_necklace AS "hasNecklace",
        ci.has_earrings AS "hasEarrings",
        ci.has_teeka AS "hasTeeka",
        ci.has_pasa AS "hasPasa"
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
          OR ci.name ILIKE (${search} || '%')
          OR ci.sku = ${search}
        )
        ${cursorSql}
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
        AND NOT EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id)
    ),
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
    ),
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
        BOOL_OR(
          NOT bj.pick_necklace AND NOT bj.pick_earrings
          AND NOT bj.pick_teeka AND NOT bj.pick_pasa
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
    ),
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
          )
        )
      ORDER BY ci.category, ci.name, ci.id
      LIMIT ${limit + 1}
    )
    SELECT
      fa.*,
      COALESCE(jew.necklace_busy, false) AS "necklaceBusy",
      COALESCE(jew.earrings_busy, false) AS "earringsBusy",
      COALESCE(jew.teeka_busy, false) AS "teekaBusy",
      COALESCE(jew.pasa_busy, false) AS "pasaBusy",
      COALESCE(jew.whole_busy, false) AS "wholeJewelleryBusy",
      CASE WHEN rb.id IS NULL THEN NULL ELSE jsonb_build_object(
        'booking_id', rb.id,
        'serial_no', rb.monthly_serial,
        'customer_name', rb.customer_name,
        'contact_1', rb.contact_1,
        'delivery_date', to_char(rb.delivery_date, 'DD/MM/YYYY'),
        'delivery_time', rb.delivery_time,
        'return_date', to_char(rb.return_date, 'DD/MM/YYYY'),
        'return_time', rb.return_time
      ) END AS "returningWarning",
      CASE WHEN bb.id IS NULL THEN NULL ELSE jsonb_build_object(
        'booking_id', bb.id,
        'serial_no', bb.monthly_serial,
        'customer_name', bb.customer_name,
        'contact_1', bb.contact_1,
        'delivery_date', to_char(bb.delivery_date, 'DD/MM/YYYY'),
        'delivery_time', bb.delivery_time,
        'return_date', to_char(bb.return_date, 'DD/MM/YYYY'),
        'return_time', bb.return_time
      ) END AS "bookedWarning"
    FROM final_availability fa
    LEFT JOIN jewellery_part_occupancy jew ON jew.item_id = fa.id
    LEFT JOIN same_day_return_warnings rw ON rw.item_id = fa.id
    LEFT JOIN bookings rb ON rb.id = rw.booking_id
    LEFT JOIN same_day_delivery_warnings bw ON bw.item_id = fa.id
    LEFT JOIN bookings bb ON bb.id = bw.booking_id
    ORDER BY fa.category, fa.name, fa.id
  `;

  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const free_items = visible.map((row) => {
    const isJewellery = row.itemType === "jewellery";
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
      thumbnail: row.thumbnail,
      photo: row.thumbnail,
      has_necklace: row.hasNecklace,
      has_earrings: row.hasEarrings,
      has_teeka: row.hasTeeka,
      has_pasa: row.hasPasa,
      booked_parts: isJewellery ? partsFor(row, true) : [],
      available_parts: isJewellery ? partsFor(row, false) : [],
      returning_warning: warningShape(row.returningWarning),
      booked_warning: warningShape(row.bookedWarning),
    };
  });
  const last = visible[visible.length - 1];
  return {
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
            id: last.id,
          })
        : null,
    limit,
  };
}
