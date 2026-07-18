import type { Prisma } from "@prisma/client";

type SkuDbClient = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Atomically reserve SKU numbers using an injected transaction client.
 *
 * Kept free of Next's `server-only` runtime guard so the local Postgres
 * integration harness can verify concurrency without importing the entire
 * inventory service graph.
 */
export async function allocateInventorySkusWithClient(
  count: number,
  client: SkuDbClient,
): Promise<string[]> {
  const n = Math.max(1, Math.min(Math.floor(count), 500));
  const rows = await client.$queryRaw<Array<{ start_value: bigint }>>`
    UPDATE inventory_sku_counter
    SET next_value = next_value + ${n}
    WHERE id = 1
    RETURNING (next_value - ${n}) AS start_value
  `;
  const start = Number(rows[0]?.start_value ?? 1);
  return Array.from(
    { length: n },
    (_, i) => `ITM-${String(start + i).padStart(4, "0")}`,
  );
}
