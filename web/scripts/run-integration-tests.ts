/**
 * Integration harness for CI Postgres. Fails hard if missing.
 * Never targets production.
 */
import { PrismaClient } from "@prisma/client";
import { allocateInventorySkus } from "../src/lib/services/inventoryOps";
import { buildWhatsAppIdempotencyKey } from "../src/lib/mutationIdempotency";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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

    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => allocateInventorySkus(3, tx)),
      prisma.$transaction((tx) => allocateInventorySkus(3, tx)),
    ]);
    const set = new Set([...a, ...b]);
    assert(set.size === 6, `SKU collision detected: ${[...a, ...b].join(",")}`);

    await prisma.$queryRaw`SELECT lease_expires_at FROM mutation_receipts LIMIT 0`;
    await prisma.$queryRaw`SELECT idempotency_key FROM whatsapp_send_ledger LIMIT 0`;

    const key = buildWhatsAppIdempotencyKey("return_receipt", 42);
    assert(key.startsWith("return_receipt:42:"), "return_receipt key shape");

    console.log("Integration checks passed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
