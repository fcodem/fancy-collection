/**
 * Backfill AI fingerprints for all existing inventory items.
 * Run: npx tsx scripts/rebuild-ai-fingerprints.ts [--force]
 */
import { PrismaClient } from "@prisma/client";
import { rebuildAllAiProfiles } from "../src/lib/dressChecker/processInventory";

async function main() {
  const force = process.argv.includes("--force");
  const prisma = new PrismaClient();
  const total = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  await prisma.$disconnect();

  console.log(`Rebuilding AI fingerprints for up to ${total} items (force=${force})…`);
  const result = await rebuildAllAiProfiles(force);
  console.log(`Done: ${result.processed} processed, ${result.failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
