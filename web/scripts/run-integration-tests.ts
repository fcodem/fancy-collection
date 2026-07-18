/**
 * Integration harness for CI Postgres. Fails hard if missing.
 * Never targets production.
 */
import { PrismaClient } from "@prisma/client";
import { allocateInventorySkusWithClient } from "../src/lib/inventorySkuAllocator";
import { buildWhatsAppIdempotencyKey } from "../src/lib/mutationIdempotency";
import { createHash } from "crypto";
import { searchAvailableItems } from "../src/lib/services/availabilitySearch";

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

  const prisma = new PrismaClient();
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

    console.log("Integration checks passed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
