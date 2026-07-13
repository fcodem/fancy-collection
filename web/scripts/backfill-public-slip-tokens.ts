/**
 * Backfill random publicAccessToken for existing bookings.
 * Run once after deploying the public_access_token migration:
 *   npx tsx scripts/backfill-public-slip-tokens.ts
 */
import { randomBytes } from "crypto";
import prisma from "../src/lib/prisma";

const TTL_DAYS = 90;

async function main() {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.booking.findMany({
    where: {
      OR: [
        { publicAccessToken: null },
        { publicAccessToken: "" },
        { publicAccessExpiresAt: null },
        { publicAccessExpiresAt: { lte: new Date() } },
      ],
    },
    select: { id: true },
    take: 5000,
  });

  let updated = 0;
  for (const row of rows) {
    const token = randomBytes(32).toString("base64url");
    try {
      await prisma.booking.update({
        where: { id: row.id },
        data: { publicAccessToken: token, publicAccessExpiresAt: expiresAt },
      });
      updated += 1;
    } catch (e) {
      console.warn(`skip booking ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`Backfilled public slip tokens for ${updated}/${rows.length} bookings (ttl=${TTL_DAYS}d).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
