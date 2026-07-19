import { Prisma } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import prisma, { parseDateQ } from "@/lib/prisma";
import { hashRequestPayload } from "@/lib/mutationIdempotency";
import { buildWhatsAppIdempotencyKey } from "@/lib/mutationIdempotency";
import { createBookingNumber, findFirstItemConflict, formatItemConflictError } from "@/lib/booking";
import { shouldSkipCustomerCreate } from "@/lib/services/customersOps";
import { broadcastShopEvent } from "@/lib/realtime/broadcast";
import { logActivity } from "@/lib/activityLog";
import type { BookingFormInput } from "@/lib/services/bookingCrud";

const BOOKING_ITEM_LOCK_NS = 872_014;
const BOOKING_MONTH_LOCK_NS = 872_015;
const PUBLIC_ACCESS_DAYS = 90;

type ItemRow = {
  id: number;
  category: string;
  size: string | null;
};

type AtomicResult = {
  resultKind: "booking" | "conflict";
  id: number | null;
  monthlySerial: number | null;
  status: string | null;
  conflictItemId: number | null;
  conflictSerial: number | null;
};

export type BookingCreateTimings = {
  /** Parallel pre-transaction reads (booking number, customer skip, inventory). */
  inventoryReadMs: number;
  /** Overlap check — folded into the atomic write when using one SQL statement. */
  conflictCheckMs: number;
  /** Monthly serial allocation — folded into the atomic write when using one SQL statement. */
  serialAllocationMs: number;
  /** Single atomic PostgreSQL write (locks, conflict, serial, inserts, outbox). */
  transactionMs: number;
  postCommitMs: number;
  queryCount: number;
};

export type FastBookingResult = {
  id: number;
  monthlySerial: number;
  status: string;
};

function whatsappReceiptsDisabled(): boolean {
  const value = process.env.WHATSAPP_RECEIPTS_DISABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function monthLockKey(date: Date): number {
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

/**
 * Fast booking create for PostgreSQL.
 *
 * Preload is three parallel, bounded reads. All conflict protection and writes
 * then execute in ONE PostgreSQL statement. Data-modifying CTEs make the
 * statement atomic without a Prisma interactive transaction:
 *
 *  1. acquire sorted per-item advisory locks and one month lock;
 *  2. perform one set-based overlap check;
 *  3. allocate the next non-unlucky monthly serial;
 *  4. insert booking, items, orders, customer, inventory statuses, mutation
 *     receipt and durable WhatsApp/slip outbox record.
 *
 * Query budget: 3 parallel preload reads + 1 atomic write = 4 queries.
 */
export async function createBookingFast(
  input: BookingFormInput,
  createdBy?: string,
  origin = "",
  onTiming?: (timings: BookingCreateTimings) => void,
): Promise<FastBookingResult> {
  const startedAt = Date.now();
  const itemIds = [...new Set(input.items.map((item) => item.item_id))].sort((a, b) => a - b);
  const deliveryDate = parseDateQ(input.delivery_date);
  const returnDate = parseDateQ(input.return_date);

  const inventoryReadStarted = Date.now();
  const [bookingNumber, skipCustomer, inventoryItems] = await Promise.all([
    createBookingNumber(),
    shouldSkipCustomerCreate(input.contact_1, input.whatsapp_no),
    prisma.clothingItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, category: true, size: true },
    }),
  ]);
  const inventoryReadMs = Date.now() - inventoryReadStarted;

  const itemMap = new Map<number, ItemRow>(inventoryItems.map((item) => [item.id, item]));
  for (const row of input.items) {
    if (!itemMap.has(row.item_id)) {
      throw new Error(`Dress '${row.dress_name}' not found.`);
    }
  }

  const totalPrice = input.items.reduce((sum, item) => sum + item.price, 0);
  const totalAdvance = input.items.reduce((sum, item) => sum + item.advance, 0);
  const totalRemaining = totalPrice - totalAdvance;
  const operationId = input.client_request_id?.trim() || "";
  const requestHash = hashRequestPayload(input);
  // Generate opaque values in memory before the write. Importing the QR module
  // here would unnecessarily pull QR image generation into the save route.
  const qrToken = randomUUID();
  const publicAccessToken = randomBytes(32).toString("base64url");
  const publicAccessExpiresAt = new Date(Date.now() + PUBLIC_ACCESS_DAYS * 86_400_000);
  const staffNames = (input.staff_names || []).filter(Boolean).join(", ");

  const itemRows = input.items.map((row) => {
    const item = itemMap.get(row.item_id)!;
    return {
      item_id: item.id,
      dress_name: row.dress_name,
      category: item.category,
      size: item.size || "",
      price: row.price,
      advance: row.advance,
      remaining: row.price - row.advance,
      notes: row.notes || null,
    };
  });
  const orderRows = (input.orders || [])
    .filter((order) => order.description.trim())
    .map((order) => ({
      description: order.description.trim(),
      cost: order.cost || 0,
      advance: order.advance || 0,
      balance: Math.max(0, (order.cost || 0) - (order.advance || 0)),
      photo: order.photo || null,
      delivery_date: parseDateQ(order.delivery_date).toISOString(),
      delivery_time: order.delivery_time,
      advance_payment_mode: order.advance_payment_mode || input.payment_mode || "cash",
    }));

  const itemRowsJson = JSON.stringify(itemRows);
  const orderRowsJson = JSON.stringify(orderRows);
  const outboxEnabled = !whatsappReceiptsDisabled();
  // The ID is allocated inside the same statement. The outbox key is generated
  // in SQL from that ID with the same canonical shape as this helper.
  const outboxKeySuffix = buildWhatsAppIdempotencyKey("booking_bill", 0).replace(
    /^booking_bill:0/,
    "",
  );

  const transactionStarted = Date.now();
  const rows = await prisma.$queryRaw<AtomicResult[]>(Prisma.sql`
    WITH RECURSIVE
    item_locks AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(
        ${BOOKING_ITEM_LOCK_NS}::integer,
        locked.item_id::integer
      )
      FROM unnest(${itemIds}::integer[]) AS locked(item_id)
      ORDER BY locked.item_id
    ),
    item_lock_guard AS MATERIALIZED (
      SELECT COUNT(*)::integer AS lock_count FROM item_locks
    ),
    month_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(
        ${BOOKING_MONTH_LOCK_NS}::integer,
        ${monthLockKey(deliveryDate)}::integer
      )
    ),
    conflict AS MATERIALIZED (
      SELECT selected.item_id, b.monthly_serial
      FROM unnest(${itemIds}::integer[]) AS selected(item_id)
      JOIN bookings b ON (
        b.item_id = selected.item_id
        OR EXISTS (
          SELECT 1
          FROM booking_items existing_item
          WHERE existing_item.booking_id = b.id
            AND existing_item.item_id = selected.item_id
            AND existing_item.is_cancelled = false
            AND existing_item.is_returned = false
        )
      )
      CROSS JOIN item_lock_guard
      WHERE b.status IN ('booked', 'delivered')
        AND b.client_request_id IS DISTINCT FROM ${operationId}
        AND b.delivery_date::date < ${returnDate}::timestamptz::date
        AND b.return_date::date > ${deliveryDate}::timestamptz::date
      ORDER BY selected.item_id, b.id
      LIMIT 1
    ),
    month_stats AS MATERIALIZED (
      SELECT
        COUNT(b.id)::integer AS booking_count,
        COALESCE(MAX(b.monthly_serial), 0)::integer AS max_value
      FROM bookings b
      CROSS JOIN month_lock
      WHERE b.delivery_date >= date_trunc('month', ${deliveryDate}::timestamptz)
        AND b.delivery_date < date_trunc('month', ${deliveryDate}::timestamptz) + interval '1 month'
    ),
    position_serial AS MATERIALIZED (
      SELECT candidate::integer AS value
      FROM month_stats,
      LATERAL generate_series(1, GREATEST(month_stats.booking_count * 3 + 100, 100)) AS candidate
      WHERE (
        SELECT COALESCE(SUM(digit::integer), 0)
        FROM regexp_split_to_table(candidate::text, '') AS digit
      ) NOT IN (4, 8)
      ORDER BY candidate
      OFFSET (SELECT booking_count FROM month_stats)
      LIMIT 1
    ),
    next_serial AS MATERIALIZED (
      SELECT candidate::integer AS value
      FROM month_stats
      CROSS JOIN position_serial,
      LATERAL generate_series(
        GREATEST(position_serial.value, month_stats.max_value + 1),
        GREATEST(position_serial.value, month_stats.max_value + 1) + 100
      ) AS candidate
      WHERE (
        SELECT COALESCE(SUM(digit::integer), 0)
        FROM regexp_split_to_table(candidate::text, '') AS digit
      ) NOT IN (4, 8)
      ORDER BY candidate
      LIMIT 1
    ),
    allocated_id AS MATERIALIZED (
      SELECT nextval(pg_get_serial_sequence('bookings', 'id'))::integer AS id
      WHERE NOT EXISTS (SELECT 1 FROM conflict)
    ),
    claimed_operation AS (
      INSERT INTO mutation_receipts (
        operation_id, operation_type, booking_id, request_hash, status,
        result_json, claimed_at, completed_at, created_at
      )
      SELECT
        ${operationId}, 'booking_create', allocated.id, ${requestHash}, 'completed',
        jsonb_build_object('id', allocated.id, 'serial', serial.value),
        NOW(), NOW(), NOW()
      FROM allocated_id allocated
      CROSS JOIN next_serial serial
      ON CONFLICT (operation_id) DO NOTHING
      RETURNING id
    ),
    inserted_booking AS (
      INSERT INTO bookings (
        id, booking_number, monthly_serial, customer_name, customer_address,
        contact_1, whatsapp_no, venue, staff_names, delivery_date,
        delivery_time, return_date, return_time, security_deposit,
        total_price, total_advance, total_remaining, advance_payment_mode,
        common_notes, item_id, dress_name, price, advance, remaining,
        client_request_id, qr_token, public_booking_id, public_access_token,
        public_access_expires_at
      )
      SELECT
        allocated.id, ${bookingNumber}, serial.value,
        ${input.customer_name.trim()}, ${input.customer_address.trim()},
        ${input.contact_1.trim()}, ${input.whatsapp_no.trim()},
        ${input.venue?.trim() || null}, ${staffNames || null},
        ${deliveryDate}, ${input.delivery_time}, ${returnDate}, ${input.return_time},
        ${input.security_deposit || 0}, ${totalPrice}, ${totalAdvance},
        ${totalRemaining}, ${input.payment_mode === "online" ? "online" : "cash"},
        ${input.common_notes?.trim() || null}, ${itemRows[0]!.item_id},
        ${itemRows[0]!.dress_name}, ${totalPrice}, ${totalAdvance},
        ${totalRemaining}, ${operationId}, ${qrToken},
        'BK-' || lpad(allocated.id::text, 6, '0'),
        ${publicAccessToken}, ${publicAccessExpiresAt}
      FROM allocated_id allocated
      CROSS JOIN next_serial serial
      CROSS JOIN claimed_operation
      RETURNING id, monthly_serial, status
    ),
    inserted_items AS (
      INSERT INTO booking_items (
        booking_id, item_id, dress_name, category, size,
        price, advance, remaining, notes
      )
      SELECT
        booking.id, input_item.item_id, input_item.dress_name,
        input_item.category, input_item.size, input_item.price,
        input_item.advance, input_item.remaining, input_item.notes
      FROM inserted_booking booking
      CROSS JOIN jsonb_to_recordset(${itemRowsJson}::jsonb) AS input_item(
        item_id integer,
        dress_name text,
        category text,
        size text,
        price double precision,
        advance double precision,
        remaining double precision,
        notes text
      )
      RETURNING id
    ),
    updated_inventory AS (
      UPDATE clothing_items
      SET status = 'rented'
      WHERE id = ANY(${itemIds}::integer[])
        AND EXISTS (SELECT 1 FROM inserted_booking)
      RETURNING id
    ),
    inserted_orders AS (
      INSERT INTO booking_orders (
        booking_id, description, cost, advance, balance, photo,
        delivery_date, delivery_time, advance_payment_mode
      )
      SELECT
        booking.id, input_order.description, input_order.cost,
        input_order.advance, input_order.balance, input_order.photo,
        input_order.delivery_date, input_order.delivery_time,
        input_order.advance_payment_mode
      FROM inserted_booking booking
      CROSS JOIN jsonb_to_recordset(${orderRowsJson}::jsonb) AS input_order(
        description text,
        cost double precision,
        advance double precision,
        balance double precision,
        photo text,
        delivery_date timestamptz,
        delivery_time text,
        advance_payment_mode text
      )
      RETURNING id
    ),
    inserted_customer AS (
      INSERT INTO customers (name, phone, address)
      SELECT
        ${input.customer_name.trim()},
        ${input.contact_1.trim()},
        ${input.customer_address.trim()}
      FROM inserted_booking
      WHERE ${!skipCustomer}
      RETURNING id
    ),
    inserted_outbox AS (
      INSERT INTO whatsapp_jobs (
        job_type, booking_id, payload, idempotency_key,
        scheduled_at, created_by
      )
      SELECT
        'booking_bill', booking.id,
        jsonb_build_object('requestOrigin', ${origin || null}),
        'booking_bill:' || booking.id::text || ${outboxKeySuffix},
        NOW(), ${createdBy || null}
      FROM inserted_booking booking
      WHERE ${outboxEnabled}
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT
      'booking'::text AS "resultKind",
      booking.id,
      booking.monthly_serial AS "monthlySerial",
      booking.status,
      NULL::integer AS "conflictItemId",
      NULL::integer AS "conflictSerial"
    FROM inserted_booking booking
    UNION ALL
    SELECT
      'conflict'::text AS "resultKind",
      NULL::integer AS id,
      NULL::integer AS "monthlySerial",
      NULL::text AS status,
      conflict.item_id AS "conflictItemId",
      conflict.monthly_serial AS "conflictSerial"
    FROM conflict
  `);
  const transactionMs = Date.now() - transactionStarted;

  const conflict = rows.find((row) => row.resultKind === "conflict");
  if (conflict?.conflictItemId && conflict.conflictSerial != null) {
    onTiming?.({
      inventoryReadMs,
      conflictCheckMs: transactionMs,
      serialAllocationMs: 0,
      transactionMs,
      postCommitMs: 0,
      queryCount: 4,
    });
    const requested = input.items.find((item) => item.item_id === conflict.conflictItemId);
    throw new Error(
      formatItemConflictError(requested?.dress_name || "Dress", conflict.conflictSerial),
    );
  }

  const booking = rows.find((row) => row.resultKind === "booking");
  if (!booking?.id || booking.monthlySerial == null) {
    // Usually a simultaneous retry lost the operation-id claim. The caller's
    // P2002 recovery cannot run because ON CONFLICT intentionally avoids an
    // exception, so resolve the committed winner here and verify its payload.
    const existing = await prisma.$queryRaw<
      Array<{ id: number; monthlySerial: number; requestHash: string }>
    >(Prisma.sql`
      SELECT
        b.id,
        b.monthly_serial AS "monthlySerial",
        receipt.request_hash AS "requestHash"
      FROM mutation_receipts receipt
      JOIN bookings b ON b.id = receipt.booking_id
      WHERE receipt.operation_id = ${operationId}
        AND receipt.operation_type = 'booking_create'
      LIMIT 1
    `);
    const winner = existing[0];
    if (winner) {
      if (winner.requestHash !== requestHash) {
        throw new Error("operation_id was already used with a different payload");
      }
      onTiming?.({
        inventoryReadMs,
        conflictCheckMs: 0,
        serialAllocationMs: 0,
        transactionMs,
        postCommitMs: Date.now() - transactionStarted - transactionMs,
        queryCount: 5,
      });
      return { id: winner.id, monthlySerial: winner.monthlySerial, status: "booked" };
    }
    throw new Error("Booking operation could not be completed. Please retry.");
  }

  // Lightweight post-commit invalidation/event work is synchronous in-memory.
  // Audit persistence is intentionally fire-and-forget and never delays or
  // rolls back the committed booking.
  broadcastShopEvent({
    type: "booking.created",
    bookingId: booking.id,
    status: booking.status || "booked",
    by: createdBy,
  });
  void logActivity({
    username: createdBy || "system",
    action: "created",
    entity: "booking",
    entityId: booking.id,
    label: `Booking #${String(booking.monthlySerial).padStart(2, "0")} — ${input.customer_name} (${input.items.map((item) => item.dress_name).join(", ")})`,
    after: {
      id: booking.id,
      monthlySerial: booking.monthlySerial,
      status: booking.status || "booked",
      dressNames: input.items.map((item) => item.dress_name),
    },
  });

  const postCommitMs = Date.now() - startedAt - inventoryReadMs - transactionMs;
  onTiming?.({
    inventoryReadMs,
    // Conflict + serial run inside the same atomic statement; sub-stages are 0
    // on the success path so transactionMs is the authoritative write budget.
    conflictCheckMs: 0,
    serialAllocationMs: 0,
    transactionMs,
    postCommitMs,
    queryCount: 4,
  });
  return {
    id: booking.id,
    monthlySerial: booking.monthlySerial,
    status: booking.status || "booked",
  };
}

/**
 * Read an existing operation in one query and enforce same-payload retries.
 * Legacy rows created before mutation receipts are reused safely but cannot
 * provide changed-payload detection retroactively.
 */
export async function findBookingCreateOperation(
  operationId: string,
  input: BookingFormInput,
): Promise<{ id: number; monthlySerial: number } | null> {
  const rows = await prisma.$queryRaw<
    Array<{ id: number; monthlySerial: number; requestHash: string | null }>
  >(Prisma.sql`
    SELECT
      booking.id,
      booking.monthly_serial AS "monthlySerial",
      receipt.request_hash AS "requestHash"
    FROM bookings booking
    LEFT JOIN mutation_receipts receipt
      ON receipt.operation_id = booking.client_request_id
      AND receipt.operation_type = 'booking_create'
    WHERE booking.client_request_id = ${operationId}
    LIMIT 1
  `);
  const existing = rows[0];
  if (!existing) return null;
  if (existing.requestHash && existing.requestHash !== hashRequestPayload(input)) {
    throw new Error("operation_id was already used with a different payload");
  }
  return { id: existing.id, monthlySerial: existing.monthlySerial };
}

// Type-only anchor: this documents that the fast query preserves the same
// overlap semantics as the canonical checker while avoiding a second query.
void (null as unknown as typeof findFirstItemConflict);
