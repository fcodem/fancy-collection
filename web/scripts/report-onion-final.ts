/**
 * Post-implementation report for ONION BRIDAL (ITM-1049).
 */
import { PrismaClient } from "@prisma/client";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { searchInventoryByDressCheckerEnterprise } from "../src/lib/dressChecker/enterpriseSearch";
import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";
import { formatColourDiagnostics } from "../src/lib/dressChecker/dressColourLab";

const prisma = new PrismaClient();
const ITEM_ID = 1049;

async function main() {
  const item = await prisma.clothingItem.findUnique({
    where: { id: ITEM_ID },
    select: {
      sku: true,
      name: true,
      photo: true,
      originalPhoto: true,
      identificationIndex: true,
      aiProfile: {
        select: {
          recognitionVersion: true,
          pipelineVersion: true,
          matchingVersion: true,
          dominantColor: true,
          secondaryColor: true,
          embroiderySignature: true,
          borderSignature: true,
          motifSignature: true,
          textureSignature: true,
          stoneSignature: true,
          panelSignature: true,
          colourAnalysis: true,
          recognitionFingerprint: true,
          garmentAttributes: true,
        },
      },
    },
  });

  const ga = item?.aiProfile?.garmentAttributes as {
    identificationIndex?: { references?: unknown[] };
  } | null;
  const itemIndex = item?.identificationIndex as { references?: unknown[] } | null;
  const fp = item?.aiProfile?.recognitionFingerprint as {
    primaryColour?: string;
    colourFamily?: string;
    colourDiagnostics?: unknown;
  } | null;
  const colour = item?.aiProfile?.colourAnalysis as {
    primary?: string;
    family?: string;
    diagnostics?: { finalColourFamily?: string; primaryColour?: string };
  } | null;

  console.log("=== 1. ITM-1049 PROFILE ===");
  console.log(
    JSON.stringify(
      {
        sku: item?.sku,
        name: item?.name,
        recognitionVersion: item?.aiProfile?.recognitionVersion,
        pipelineVersion: item?.aiProfile?.pipelineVersion,
        matchingVersion: item?.aiProfile?.matchingVersion,
        identificationIndex:
          (itemIndex?.references?.length ?? 0) > 0 ||
          (ga?.identificationIndex?.references?.length ?? 0) > 0,
        identificationIndexRefs:
          itemIndex?.references?.length ?? ga?.identificationIndex?.references?.length ?? 0,
        embroidery_signature: !!item?.aiProfile?.embroiderySignature,
        border_signature: !!item?.aiProfile?.borderSignature,
        motif_signature: !!item?.aiProfile?.motifSignature,
        stone_signature: !!item?.aiProfile?.stoneSignature,
        texture_signature: !!item?.aiProfile?.textureSignature,
        panel_signature: !!item?.aiProfile?.panelSignature,
        dominantColor: item?.aiProfile?.dominantColor,
        secondaryColor: item?.aiProfile?.secondaryColor,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 2. DETECTED COLOUR ===");
  console.log(
    JSON.stringify(
      {
        dominantColor_column: item?.aiProfile?.dominantColor,
        colourAnalysis_primary: colour?.primary,
        colourAnalysis_family: colour?.family,
        fingerprint_primaryColour: fp?.primaryColour,
        fingerprint_colourFamily: fp?.colourFamily,
        diagnostics_primary: colour?.diagnostics?.primaryColour,
        diagnostics_family: colour?.diagnostics?.finalColourFamily,
      },
      null,
      2,
    ),
  );

  const photoPath = item?.originalPhoto || item?.photo || "";
  const buffer = await loadPhotoBuffer(photoPath);
  if (!buffer) throw new Error("Could not load photo");

  const query = await analyzeQueryImage(buffer, undefined, {
    category: "Lehenga",
    name: item?.name || "ONION BRIDAL",
  });
  if (query.fingerprint.colourDiagnostics) {
    console.log("\nLive query colour diagnostics:");
    console.log(formatColourDiagnostics(query.fingerprint.colourDiagnostics));
  }

  console.log("\n=== 3. SEARCH RESULTS ===");
  const result = await searchInventoryByDressCheckerEnterprise(
    buffer,
    { category: "Lehenga" },
    { debug: true, limit: 20 },
  );

  const scored =
    (
      result.ai_diagnostics as {
        scored?: Array<{
          itemId: number;
          sku?: string;
          name?: string;
          embeddingScore: number;
          fineGrainedScore: number;
          identityScore: number | null;
          finalScore: number;
          rejected: boolean;
          rejectReason?: string;
          components?: { colorScore?: number; borderScore?: number; motifScore?: number };
        }>;
      }
    )?.scored ?? [];

  const ids = scored.map((s) => s.itemId);
  const items = await prisma.clothingItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, name: true },
  });
  const map = new Map(items.map((i) => [i.id, i]));

  console.log("\nDisplayed:");
  for (const [i, r] of result.results.entries()) {
    console.log(
      `#${i + 1} ${r.sku} ${r.name} | final=${r.similarity} emb=${Number(r.embedding_score).toFixed(1)} identity/fg=${r.fine_grained_score} colour=${r.color_score} border=${r.border_score} openai=${r.openai_score} band=${r.confidence_band}`,
    );
  }

  console.log("\nAll scored (incl. rejected):");
  for (const [i, s] of scored.entries()) {
    const meta = map.get(s.itemId);
    console.log(
      `${i + 1}. ${meta?.sku} ${meta?.name} | emb=${s.embeddingScore.toFixed(1)} identity=${s.identityScore ?? "n/a"} colour=${s.components?.colorScore ?? 0} final=${s.finalScore} rejected=${s.rejected}${s.rejectReason ? ` (${s.rejectReason})` : ""}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
