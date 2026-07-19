import { Prisma } from "@prisma/client";
import prisma, { isSqliteDb, parseDateQ } from "@/lib/prisma";

type WarnJson = Record<string, unknown> | null;

type RawDateCheckRow = {
  item_id: number;
  item_name: string;
  status: string;
  conflict: WarnJson;
  returning_warning: WarnJson;
  booked_on_return_warning: WarnJson;
};

export type BookingDateCheckRow = {
  item_id: number;
  item_name: string;
  status:
    | "ok"
    | "hard_conflict"
    | "returning_warning"
    | "booked_on_return_warning"
    | "both_warnings";
  conflict?: ReturnType<typeof mapWarning>;
  returning_warning?: ReturnType<typeof mapWarning> | null;
  booked_on_return_warning?: ReturnType<typeof mapWarning> | null;
};

function mapWarning(raw: WarnJson) {
  if (!raw) return null;
  return {
    customer: String(raw.customer_name ?? raw.customer ?? ""),
    serial_no: Number(raw.serial_no ?? 0),
    delivery_date: String(raw.delivery_date ?? ""),
    return_date: String(raw.return_date ?? ""),
    delivery_time: String(raw.delivery_time ?? ""),
    return_time: String(raw.return_time ?? ""),
    venue: String(raw.venue ?? ""),
    contact: String(raw.contact_1 ?? raw.contact ?? ""),
    total_rent: Number(raw.total_rent ?? raw.total_price ?? 0),
  };
}

function warnJson(alias: string) {
  return Prisma.sql`CASE WHEN ${Prisma.raw(alias)}.id IS NULL THEN NULL ELSE jsonb_build_object(
    'serial_no', ${Prisma.raw(alias)}.monthly_serial,
    'customer_name', ${Prisma.raw(alias)}.customer_name,
    'contact_1', ${Prisma.raw(alias)}.contact_1,
    'delivery_date', to_char(${Prisma.raw(alias)}.delivery_date, 'DD/MM/YYYY'),
    'delivery_time', ${Prisma.raw(alias)}.delivery_time,
    'return_date', to_char(${Prisma.raw(alias)}.return_date, 'DD/MM/YYYY'),
    'return_time', ${Prisma.raw(alias)}.return_time,
    'venue', COALESCE(${Prisma.raw(alias)}.venue, ''),
    'total_rent', COALESCE(${Prisma.raw(alias)}.total_price, ${Prisma.raw(alias)}.price, 0)
  ) END`;
}

/** PostgreSQL fast path: one bounded query for all requested item IDs. */
export async function searchBookingDateCheck(opts: {
  bookingId: number;
  deliveryDate: string;
  returnDate: string;
  itemIds: number[];
}): Promise<BookingDateCheckRow[]> {
  if (isSqliteDb()) {
    throw new Error("searchBookingDateCheck requires PostgreSQL");
  }

  const uniqueIds = [...new Set(opts.itemIds.filter(Boolean))];
  if (!uniqueIds.length) return [];

  const deliveryStart = parseDateQ(opts.deliveryDate);
  const returnStart = parseDateQ(opts.returnDate);
  const returnEnd = new Date(returnStart.getTime() + 86_400_000);
  const excludeId = opts.bookingId > 0 ? opts.bookingId : null;

  const rows = await prisma.$queryRaw<RawDateCheckRow[]>`
    WITH requested_items AS (
      SELECT
        ci.id,
        ci.name,
        ci.item_type AS "itemType",
        ci.has_necklace AS "hasNecklace",
        ci.has_earrings AS "hasEarrings",
        ci.has_teeka AS "hasTeeka",
        ci.has_pasa AS "hasPasa"
      FROM clothing_items ci
      WHERE ci.id IN (${Prisma.join(uniqueIds)})
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
      JOIN requested_items ri ON ri.id = bi.item_id
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
      JOIN requested_items ri ON ri.id = b.item_id
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
      JOIN requested_items ri ON ri.id = bj.item_id
      WHERE bj.status = 'active'
        AND b.status IN ('booked', 'delivered')
        AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
        AND b.delivery_date < ${returnEnd}
        AND b.return_date >= ${deliveryStart}
    ),
    combined_occupancy AS (
      SELECT * FROM active_booking_occupancy
      UNION ALL
      SELECT * FROM legacy_booking_occupancy
      UNION ALL
      SELECT * FROM jewellery_booking_boundaries
    ),
    hard_conflicts AS (
      SELECT DISTINCT ON (item_id) item_id, booking_id
      FROM combined_occupancy
      WHERE occupancy_kind = 'busy'
      ORDER BY item_id, booking_id
    ),
    return_warnings AS (
      SELECT DISTINCT ON (item_id) item_id, booking_id
      FROM combined_occupancy
      WHERE occupancy_kind = 'returning'
      ORDER BY item_id, booking_id
    ),
    delivery_warnings AS (
      SELECT DISTINCT ON (item_id) item_id, booking_id
      FROM combined_occupancy
      WHERE occupancy_kind = 'booked'
      ORDER BY item_id, booking_id
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
      JOIN requested_items ri ON ri.id = bj.item_id
      WHERE bj.status = 'active'
        AND b.status IN ('booked', 'delivered')
        AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
        AND b.delivery_date < ${returnEnd}
        AND b.return_date >= ${deliveryStart}
      GROUP BY bj.item_id
    ),
    jewellery_hard_block AS (
      SELECT ri.id AS item_id
      FROM requested_items ri
      LEFT JOIN jewellery_part_occupancy jew ON jew.item_id = ri.id
      WHERE ri."itemType" = 'jewellery'
        AND (
          COALESCE(jew.whole_busy, false) = true
          OR (
            (NOT ri."hasNecklace" OR COALESCE(jew.necklace_busy, false))
            AND (NOT ri."hasEarrings" OR COALESCE(jew.earrings_busy, false))
            AND (NOT ri."hasTeeka" OR COALESCE(jew.teeka_busy, false))
            AND (NOT ri."hasPasa" OR COALESCE(jew.pasa_busy, false))
          )
        )
    ),
    jewellery_busy_booking AS (
      SELECT DISTINCT ON (bj.item_id) bj.item_id, b.id AS booking_id
      FROM booking_jewellery bj
      JOIN bookings b ON b.id = bj.booking_id
      JOIN requested_items ri ON ri.id = bj.item_id
      WHERE bj.status = 'active'
        AND b.status IN ('booked', 'delivered')
        AND (${excludeId}::int IS NULL OR b.id <> ${excludeId})
        AND b.delivery_date < ${returnEnd}
        AND b.return_date >= ${deliveryStart}
        AND (b.return_date AT TIME ZONE 'UTC')::date <> (${deliveryStart}::timestamptz AT TIME ZONE 'UTC')::date
        AND (b.delivery_date AT TIME ZONE 'UTC')::date <> (${returnStart}::timestamptz AT TIME ZONE 'UTC')::date
      ORDER BY bj.item_id, b.id
    ),
    final_result AS (
      SELECT
        ri.id AS item_id,
        ri.name AS item_name,
        CASE
          WHEN hc.booking_id IS NOT NULL OR jhb.item_id IS NOT NULL THEN 'hard_conflict'
          WHEN rw.booking_id IS NOT NULL AND dw.booking_id IS NOT NULL THEN 'both_warnings'
          WHEN rw.booking_id IS NOT NULL THEN 'returning_warning'
          WHEN dw.booking_id IS NOT NULL THEN 'booked_on_return_warning'
          ELSE 'ok'
        END AS status,
        CASE
          WHEN hc.booking_id IS NOT NULL OR jhb.item_id IS NOT NULL
          THEN ${warnJson("cb")}
          ELSE NULL
        END AS conflict,
        CASE
          WHEN hc.booking_id IS NULL AND jhb.item_id IS NULL
          THEN ${warnJson("rb")}
          ELSE NULL
        END AS returning_warning,
        CASE
          WHEN hc.booking_id IS NULL AND jhb.item_id IS NULL
          THEN ${warnJson("bb")}
          ELSE NULL
        END AS booked_on_return_warning
      FROM requested_items ri
      LEFT JOIN hard_conflicts hc ON hc.item_id = ri.id
      LEFT JOIN jewellery_hard_block jhb ON jhb.item_id = ri.id
      LEFT JOIN jewellery_busy_booking jbb ON jbb.item_id = ri.id
      LEFT JOIN return_warnings rw ON rw.item_id = ri.id
      LEFT JOIN delivery_warnings dw ON dw.item_id = ri.id
      LEFT JOIN bookings cb ON cb.id = COALESCE(hc.booking_id, jbb.booking_id)
      LEFT JOIN bookings rb ON rb.id = rw.booking_id
      LEFT JOIN bookings bb ON bb.id = dw.booking_id
    )
    SELECT * FROM final_result
  `;

  const byId = new Map(rows.map((row) => [row.item_id, row]));
  const results: BookingDateCheckRow[] = [];

  for (const itemId of opts.itemIds) {
    const row = byId.get(itemId);
    if (!row) continue;

    const status = row.status as BookingDateCheckRow["status"];
    if (status === "hard_conflict") {
      results.push({
        item_id: row.item_id,
        item_name: row.item_name,
        status,
        conflict: mapWarning(row.conflict) ?? undefined,
      });
      continue;
    }

    if (status === "ok") {
      results.push({
        item_id: row.item_id,
        item_name: row.item_name,
        status,
        returning_warning: null,
        booked_on_return_warning: null,
      });
      continue;
    }

    results.push({
      item_id: row.item_id,
      item_name: row.item_name,
      status,
      returning_warning: mapWarning(row.returning_warning),
      booked_on_return_warning: mapWarning(row.booked_on_return_warning),
    });
  }

  return results;
}
