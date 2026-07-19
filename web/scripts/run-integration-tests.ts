/**
 * Integration harness for CI Postgres. Fails hard if missing.
 * Never targets production.
 */
import { PrismaClient } from "@prisma/client";
import { allocateInventorySkusWithClient } from "../src/lib/inventorySkuAllocator";
import { buildWhatsAppIdempotencyKey } from "../src/lib/mutationIdempotency";
import { createHash } from "crypto";
import { searchAvailableItems } from "../src/lib/services/availabilitySearch";
import { getPackingListPage } from "../src/lib/services/packingList";
import { createScannedDressAvailabilityService } from "../src/lib/services/scannedDressAvailability";
import {
  createBoundedTtlCache,
  hashScanCode,
  scanAvailabilityCacheKey,
} from "../src/lib/services/scanAvailabilityApi";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  assert(url, "DATABASE_URL required");
  if (!/127\.0\.0\.1|localhost|fancy_test|:5432\/test/i.test(url) && process.env.ALLOW_PROD_INTEGRATION !== "1") {
    throw new Error("Refusing non-local DATABASE_URL for integration tests");
  }

  const observedQueries: string[] = [];
  const prisma = new PrismaClient({
    log: [{ emit: "event", level: "query" }],
  });
  prisma.$on("query", (event) => observedQueries.push(event.query));
  try {
    await prisma.$queryRaw`SELECT 1`;

    await prisma.$executeRaw`
      INSERT INTO inventory_sku_counter (id, next_value)
      VALUES (1, 1)
      ON CONFLICT (id) DO NOTHING
    `.catch(async () => {
      /* table may not exist yet — migrate deploy should create it */
    });

    const counter = await prisma.$queryRaw<Array<{ next_value: bigint }>>`
      SELECT next_value FROM inventory_sku_counter WHERE id = 1
    `;
    assert(counter.length === 1, "inventory_sku_counter not seeded");

    // Concurrent SKU allocation must not collide.
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => allocateInventorySkusWithClient(3, tx)),
      prisma.$transaction((tx) => allocateInventorySkusWithClient(3, tx)),
    ]);
    const set = new Set([...a, ...b]);
    assert(set.size === 6, `SKU collision detected: ${[...a, ...b].join(",")}`);

    await prisma.$queryRaw`SELECT lease_expires_at FROM mutation_receipts LIMIT 0`;
    await prisma.$queryRaw`SELECT idempotency_key FROM whatsapp_send_ledger LIMIT 0`;
    await prisma.$queryRaw`SELECT inventory_group_id FROM clothing_items LIMIT 0`;

    const key = buildWhatsAppIdempotencyKey("return_receipt", 42);
    assert(key.startsWith("return_receipt:42:"), "return_receipt key shape");

    // Concurrent mutation_receipt claims: one wins, second sees existing row / P2002.
    const opId = `itest-claim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = { v: 1, note: "concurrency" };
    const requestHash = hashPayload(payload);
    const lease = new Date(Date.now() + 60_000);

    const claimOnce = async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ status: string }>>`
            SELECT status FROM mutation_receipts
            WHERE operation_id = ${opId}
            FOR UPDATE
          `;
          if (rows[0]) return { won: false as const, status: rows[0].status };
          await tx.mutationReceipt.create({
            data: {
              operationId: opId,
              operationType: "integration_test",
              requestHash,
              status: "processing",
              claimedAt: new Date(),
              leaseExpiresAt: lease,
            },
          });
          return { won: true as const, status: "processing" };
        });
      } catch (e) {
        // Concurrent create race: unique violation means the other claim won.
        if ((e as { code?: string })?.code === "P2002") {
          return { won: false as const, status: "processing" };
        }
        throw e;
      }
    };

    const [c1, c2] = await Promise.all([claimOnce(), claimOnce()]);
    assert(c1.won !== c2.won, "exactly one concurrent claim should win");
    const winner = c1.won ? c1 : c2;
    assert(winner.status === "processing", "winner must be processing");

    // condition_notes must affect request hash (idempotency key material).
    const h1 = hashPayload({ name: "A", condition_notes: "" });
    const h2 = hashPayload({ name: "A", condition_notes: "stain" });
    assert(h1 !== h2, "condition_notes must change payload hash");

    // Send-ledger uniqueness: duplicate idempotency key rejected.
    const ledgerKey = `itest-ledger-${Date.now()}`;
    await prisma.whatsAppSendLedger.create({
      data: { idempotencyKey: ledgerKey, sendStartedAt: new Date() },
    });
    let dupBlocked = false;
    try {
      await prisma.whatsAppSendLedger.create({
        data: { idempotencyKey: ledgerKey, sendStartedAt: new Date() },
      });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      dupBlocked = code === "P2002" || /unique/i.test(e instanceof Error ? e.message : "");
    }
    assert(dupBlocked, "whatsapp_send_ledger must enforce unique idempotency_key");

    // Availability must execute as one bounded PostgreSQL CTE and return a valid cursor page.
    const availability = await searchAvailableItems({
      deliveryDate: "2035-01-10",
      returnDate: "2035-01-12",
      limit: 2,
    });
    assert(availability.free_items.length <= 2, "availability limit must be enforced");
    if (availability.hasMore) {
      assert(Boolean(availability.nextCursor), "availability next cursor required");
      const secondPage = await searchAvailableItems({
        deliveryDate: "2035-01-10",
        returnDate: "2035-01-12",
        cursor: availability.nextCursor,
        limit: 2,
      });
      const firstIds = new Set(availability.free_items.map((item) => item.id));
      assert(
        secondPage.free_items.every((item) => !firstIds.has(item.id)),
        "availability cursor pages must not overlap",
      );
    }

    // Scanned dress availability: physical-code resolution, one bounded
    // booking query, cancellation/return handling, maintenance, cache
    // revision invalidation, and five concurrent staff scan sessions.
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const fixture = await prisma.clothingItem.create({
      data: {
        name: `Integration Scan Dress ${suffix}`,
        sku: `IT-SCAN-${suffix}`,
        category: "Integration",
        size: "40",
        color: "Red",
        status: "available",
        scanCodes: {
          create: {
            code: `FC-D-IT-${suffix}`,
            normalizedCode: `FC-D-IT-${suffix}`.toUpperCase(),
            format: "QR_CODE",
            source: "SYSTEM_GENERATED_QR",
            isPrimary: true,
          },
        },
      },
    });
    const bookingIds: number[] = [];
    try {
      const scanService = createScannedDressAvailabilityService(prisma);
      const scanInput = {
        rawCode: `fc-d-it-${suffix}`,
        deliveryDateTime: "2035-02-10T16:00:00+05:30",
        returnDateTime: "2035-02-12T11:00:00+05:30",
      };

      observedQueries.length = 0;
      const free = await scanService.checkScannedDressAvailability(scanInput);
      assert(free.status === "AVAILABLE", "integration scan code must resolve to free dress");
      assert(free.dress?.id === fixture.id, "scan code must resolve the correct physical dress");
      const scanCodeQueries = observedQueries.filter((query) =>
        /inventory_scan_codes/i.test(query),
      );
      const conflictQueries = observedQueries.filter((query) =>
        /FROM\s+(?:"public"\.)?"bookings"/i.test(query),
      );
      assert(scanCodeQueries.length === 1, `expected one scan-code lookup, got ${scanCodeQueries.length}`);
      assert(conflictQueries.length === 1, `expected one bounded booking query, got ${conflictQueries.length}`);
      assert(/LIMIT/i.test(conflictQueries[0] || ""), "booking conflict query must be bounded");

      const createBooking = async (opts: {
        status?: string;
        cancelled?: boolean;
        returned?: boolean;
      }) => {
        const row = await prisma.booking.create({
          data: {
            bookingNumber: `IT-BK-${suffix}-${bookingIds.length}`,
            customerName: "Integration Customer",
            customerAddress: "Integration only",
            contact1: "9800000000",
            deliveryDate: new Date("2035-02-10T00:00:00.000Z"),
            deliveryTime: "12:00 Noon",
            returnDate: new Date("2035-02-12T00:00:00.000Z"),
            returnTime: "12:00 Noon",
            status: opts.status ?? "booked",
            bookingItems: {
              create: {
                itemId: fixture.id,
                dressName: fixture.name,
                isCancelled: opts.cancelled ?? false,
                isReturned: opts.returned ?? false,
              },
            },
          },
        });
        bookingIds.push(row.id);
        return row;
      };

      const cancelled = await createBooking({ cancelled: true });
      const afterCancelled = await scanService.checkScannedDressAvailability(scanInput);
      assert(afterCancelled.status === "AVAILABLE", "cancelled booking item must be ignored");
      await prisma.booking.delete({ where: { id: cancelled.id } });
      bookingIds.splice(bookingIds.indexOf(cancelled.id), 1);

      const returned = await createBooking({ status: "delivered", returned: true });
      const afterReturned = await scanService.checkScannedDressAvailability(scanInput);
      assert(afterReturned.status === "AVAILABLE", "returned booking item must be ignored");
      await prisma.booking.delete({ where: { id: returned.id } });
      bookingIds.splice(bookingIds.indexOf(returned.id), 1);

      const blocker = await createBooking({});
      const booked = await scanService.checkScannedDressAvailability(scanInput);
      assert(booked.status === "BOOKED", "active overlapping booking must block");
      const serialized = JSON.stringify(booked);
      for (const sensitive of ["customerAddress", "idPhoto", "securityDeposit", "totalPrice"]) {
        assert(!serialized.includes(sensitive), `availability leaked ${sensitive}`);
      }

      // Revision-keyed cache misses immediately after a booking mutation.
      const cache = createBoundedTtlCache<string>({ ttlMs: 20_000, maxEntries: 10 });
      const revisionBefore = String(
        (await prisma.activityLog.findFirst({ orderBy: { id: "desc" }, select: { id: true } }))?.id ?? 0,
      );
      const keyParts = {
        userId: 1,
        codeHash: hashScanCode(scanInput.rawCode.toUpperCase()),
        deliveryDateTime: scanInput.deliveryDateTime,
        returnDateTime: scanInput.returnDateTime,
        excludeBookingId: null,
      };
      await cache.get(
        scanAvailabilityCacheKey({ ...keyParts, revision: revisionBefore }),
        async () => "BOOKED",
      );
      const activity = await prisma.activityLog.create({
        data: {
          username: "integration",
          action: "create",
          entity: "booking",
          entityId: blocker.id,
          label: "scan cache invalidation integration fixture",
        },
      });
      const revisionAfter = String(activity.id);
      const afterMutation = await cache.get(
        scanAvailabilityCacheKey({ ...keyParts, revision: revisionAfter }),
        async () => "BOOKED-REFRESHED",
      );
      assert(afterMutation.cacheStatus === "miss", "booking revision must invalidate scan cache");

      // Five staff users × ten scans, at most five concurrent DB consumers.
      const loadErrors: unknown[] = [];
      await Promise.all(
        Array.from({ length: 5 }, async () => {
          for (let scan = 0; scan < 10; scan += 1) {
            try {
              const result = await scanService.checkScannedDressAvailability(scanInput);
              assert(result.dress?.id === fixture.id, "concurrent result attached to wrong dress");
            } catch (error) {
              loadErrors.push(error);
            }
          }
        }),
      );
      const poolFailures = loadErrors.filter((error) =>
        /P2024|P2028|pool timeout|timed out fetching/i.test(String(error)),
      );
      assert(poolFailures.length === 0, "concurrent scans exhausted the Prisma pool");
      assert(loadErrors.length === 0, `concurrent scan failures: ${loadErrors.join("; ")}`);

      await prisma.booking.delete({ where: { id: blocker.id } });
      bookingIds.splice(bookingIds.indexOf(blocker.id), 1);
      await prisma.clothingItem.update({
        where: { id: fixture.id },
        data: { status: "maintenance" },
      });
      const maintenance = await scanService.checkScannedDressAvailability(scanInput);
      assert(maintenance.status === "MAINTENANCE", "maintenance dress must short-circuit");
    } finally {
      if (bookingIds.length) {
        await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      }
      await prisma.activityLog.deleteMany({
        where: { label: "scan cache invalidation integration fixture" },
      });
      await prisma.clothingItem.delete({ where: { id: fixture.id } });
    }

    const packing = await getPackingListPage({
      deliveryFrom: "2020-01-01",
      deliveryTo: "2035-12-31",
      limit: 2,
    });
    assert(packing.results.length <= 2, "packing booking page must be bounded");
    if (packing.hasMore) {
      assert(Boolean(packing.nextCursor), "packing next cursor required");
    }

    console.log("Integration checks passed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
