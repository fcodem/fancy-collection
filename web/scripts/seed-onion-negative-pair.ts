/**
 * Seed explicit negative lookalike pair: ONION BRIDAL (1049) vs ONION BRIDAL 2 (1050).
 * Usage: npx tsx scripts/seed-onion-negative-pair.ts
 */
import prisma from "../src/lib/prisma";

async function main() {
  const a = await prisma.clothingItem.findFirst({ where: { sku: "ITM-1049" }, select: { id: true, sku: true } });
  const b = await prisma.clothingItem.findFirst({ where: { sku: "ITM-1050" }, select: { id: true, sku: true } });
  if (!a || !b) {
    console.error("Missing ITM-1049 or ITM-1050 — skip seed");
    process.exitCode = 1;
    return;
  }

  // Each side as rejected lookalike of the other (admin-confirmed series)
  for (const [rejected, query] of [
    [a.id, b.id],
    [b.id, a.id],
  ] as const) {
    await prisma.$executeRaw`
      INSERT INTO dress_negative_pairs
        (query_item_id, rejected_item_id, reason, source, confirmed_by)
      SELECT ${query}, ${rejected}, ${"onion_bridal_lookalike_series"}, ${"seed_script"}, ${"system"}
      WHERE NOT EXISTS (
        SELECT 1 FROM dress_negative_pairs
        WHERE rejected_item_id = ${rejected}
          AND COALESCE(query_item_id, 0) = ${query}
          AND source = 'seed_script'
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO dress_search_feedback
        (correct_item_id, predicted_item_id, feedback, notes, created_by)
      VALUES (
        ${query},
        ${rejected},
        ${"same_collection"},
        ${`Seeded lookalike: correct=${query} predicted_lookalike=${rejected}`},
        ${"system"}
      )
    `;
  }

  console.log(`Seeded onion negative pairs for ${a.sku} ↔ ${b.sku}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
