/**
 * Reproduce Onion Bridal query → ranking vs Blue Cutdana.
 * Uses catalog photo of ONION BRIDAL as the query image.
 */
import { PrismaClient } from "@prisma/client";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { searchInventoryByDressCheckerEnterprise } from "../src/lib/dressChecker/enterpriseSearch";
import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";

const prisma = new PrismaClient();

async function main() {
  const onion = await prisma.clothingItem.findFirst({
    where: { sku: "ITM-1049" },
    select: { id: true, sku: true, name: true, photo: true, originalPhoto: true },
  });
  if (!onion?.photo) {
    console.error("ONION BRIDAL not found or has no photo");
    process.exit(1);
  }

  const photoPath = onion.originalPhoto || onion.photo;
  console.log("Query item:", onion.sku, onion.name, "photo=", photoPath);

  const buffer = await loadPhotoBuffer(photoPath);
  if (!buffer) {
    console.error("Could not load photo buffer");
    process.exit(1);
  }

  console.log("\n=== QUERY ANALYSIS ===");
  const query = await analyzeQueryImage(buffer, undefined, { category: "Lehenga", name: onion.name });
  console.log(
    JSON.stringify(
      {
        detectedCategory: query.category,
        primaryColour: query.fingerprint.primaryColour,
        secondaryColour: query.fingerprint.secondaryColour,
        colourFamily: query.fingerprint.colourFamily,
        embroideryStyle: query.fingerprint.embroideryStyle,
        embroideryDensity: query.fingerprint.embroideryDensity,
        silhouette: query.fingerprint.silhouette,
        stageLog: query.stageLog,
      },
      null,
      2,
    ),
  );

  console.log("\n=== ENTERPRISE SEARCH (debug) ===");
  const result = await searchInventoryByDressCheckerEnterprise(
    buffer,
    { category: "Lehenga" },
    { debug: true, limit: 20 },
  );

  console.log("\n=== DISPLAYED RESULTS ===");
  for (const [i, r] of result.results.entries()) {
    console.log(
      `#${i + 1} ${r.sku} ${r.name} sim=${r.similarity} emb=${r.embedding_score} fg=${r.fine_grained_score} color=${r.color_score} border=${r.border_score} motif=${r.motif_score} openai=${r.openai_score} band=${r.confidence_band}`,
    );
    console.log(`   reason: ${r.rank_reason}`);
    if (r.openai_verification) {
      console.log(`   gpt:`, r.openai_verification);
    }
  }

  const diag = result.ai_diagnostics as {
    vector_search?: { candidates?: number };
    scored?: Array<{
      itemId: number;
      sku?: string;
      name?: string;
      embeddingScore: number;
      fineGrainedScore: number;
      finalScore: number;
      openAiScore: number;
      rejected: boolean;
      rejectReason?: string;
      components?: Record<string, number>;
      reasoning?: string;
    }>;
    openai_verify?: unknown;
    openai_used?: boolean;
  } | undefined;

  console.log("\n=== ALL SCORED CANDIDATES (incl. hidden) ===");
  const scored = diag?.scored ?? [];
  // Enrich with names from DB if needed
  const ids = scored.map((s) => s.itemId);
  const items = await prisma.clothingItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, name: true },
  });
  const map = new Map(items.map((i) => [i.id, i]));

  for (const [i, s] of scored.entries()) {
    const item = map.get(s.itemId);
    console.log(
      JSON.stringify({
        rank: i + 1,
        sku: item?.sku,
        name: item?.name,
        embeddingScore: s.embeddingScore,
        fineGrainedScore: s.fineGrainedScore,
        finalScore: s.finalScore,
        openAiScore: s.openAiScore,
        rejected: s.rejected,
        rejectReason: s.rejectReason,
        components: s.components,
        reasoning: s.reasoning,
      }),
    );
  }

  console.log("\n=== TARGET COMPARISON ===");
  for (const sku of ["ITM-1049", "ITM-1042", "ITM-1035", "ITM-1050"]) {
    const item = items.find((i) => i.sku === sku) || (await prisma.clothingItem.findFirst({ where: { sku }, select: { id: true, sku: true, name: true } }));
    if (!item) {
      console.log(sku, "NOT IN CATALOG");
      continue;
    }
    const row = scored.find((s) => s.itemId === item.id);
    if (!row) {
      console.log(sku, item.name, "NOT IN SCORED SHORTLIST (not in pgvector top 20)");
    } else {
      console.log(
        sku,
        item.name,
        `emb=${row.embeddingScore} fg=${row.fineGrainedScore} final=${row.finalScore} openai=${row.openAiScore} rejected=${row.rejected} reason=${row.rejectReason ?? "-"}`,
      );
    }
  }

  console.log("\nopenai_used:", diag?.openai_used);
  console.log("best_similarity:", result.best_similarity);
  console.log("identification_meta:", result.identification_meta);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
