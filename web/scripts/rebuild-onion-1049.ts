/**
 * Rebuild ONION BRIDAL (ITM-1049) full identity profile, then verify self-search.
 */
import { PrismaClient } from "@prisma/client";
import { processInventoryAiProfile } from "../src/lib/dressChecker/processInventory";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { searchInventoryByDressCheckerEnterprise } from "../src/lib/dressChecker/enterpriseSearch";
import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";
import { searchGarmentIdentity } from "../src/lib/dressChecker/identitySearchEngine";
import { parseStoredFingerprint } from "../src/lib/dressChecker/featureExtraction";
import { parseProfileIdentificationIndex } from "../src/lib/dressChecker/services/inventoryAiProfileService";

const prisma = new PrismaClient();
const ITEM_ID = 1049;

async function inspect(label: string) {
  const item = await prisma.clothingItem.findUnique({
    where: { id: ITEM_ID },
    select: {
      sku: true,
      name: true,
      identificationIndex: true,
      identificationIndexedAt: true,
      aiProfile: {
        select: {
          status: true,
          pipelineVersion: true,
          recognitionVersion: true,
          matchingVersion: true,
          dominantColor: true,
          secondaryColor: true,
          embroiderySignature: true,
          borderSignature: true,
          motifSignature: true,
          textureSignature: true,
          silhouetteSignature: true,
          stoneSignature: true,
          panelSignature: true,
          lastIndexedAt: true,
          garmentAttributes: true,
          recognitionFingerprint: true,
          processingError: true,
          error: true,
        },
      },
    },
  });

  const ga = item?.aiProfile?.garmentAttributes as {
    identificationIndex?: { references?: unknown[] };
  } | null;
  const itemIndex = item?.identificationIndex as { references?: unknown[] } | null;

  const summary = {
    label,
    sku: item?.sku,
    name: item?.name,
    status: item?.aiProfile?.status,
    pipelineVersion: item?.aiProfile?.pipelineVersion,
    recognitionVersion: item?.aiProfile?.recognitionVersion,
    matchingVersion: item?.aiProfile?.matchingVersion,
    dominantColor: item?.aiProfile?.dominantColor,
    secondaryColor: item?.aiProfile?.secondaryColor,
    hasEmbroiderySignature: !!item?.aiProfile?.embroiderySignature,
    hasBorderSignature: !!item?.aiProfile?.borderSignature,
    hasMotifSignature: !!item?.aiProfile?.motifSignature,
    hasTextureSignature: !!item?.aiProfile?.textureSignature,
    hasSilhouetteSignature: !!item?.aiProfile?.silhouetteSignature,
    hasStoneSignature: !!item?.aiProfile?.stoneSignature,
    hasPanelSignature: !!item?.aiProfile?.panelSignature,
    lastIndexedAt: item?.aiProfile?.lastIndexedAt,
    identificationIndexedAt: item?.identificationIndexedAt,
    itemIndexRefs: itemIndex?.references?.length ?? 0,
    profileIndexRefs: ga?.identificationIndex?.references?.length ?? 0,
    hasRecognitionFingerprint: !!item?.aiProfile?.recognitionFingerprint,
    error: item?.aiProfile?.error || item?.aiProfile?.processingError || null,
    embroiderySignature: item?.aiProfile?.embroiderySignature,
    stoneSignature: item?.aiProfile?.stoneSignature,
    panelSignature: item?.aiProfile?.panelSignature,
  };
  console.log(JSON.stringify(summary, null, 2));
  return item;
}

async function main() {
  console.log("=== BEFORE ===");
  await inspect("before");

  console.log("\n=== REBUILD processInventoryAiProfile(1049) ===");
  const ok = await processInventoryAiProfile(ITEM_ID, "manual_onion_rebuild");
  console.log("rebuild ok:", ok);

  console.log("\n=== AFTER ===");
  const item = await inspect("after");

  const profile = item?.aiProfile;
  const ga = profile?.garmentAttributes;
  const index = parseProfileIdentificationIndex(ga);
  const fp = parseStoredFingerprint(
    profile?.recognitionFingerprint,
    item?.name || "ONION BRIDAL",
  );

  if (!index || !fp) {
    console.error("FAIL: missing identificationIndex or fingerprint after rebuild");
    process.exit(1);
  }

  console.log("\n=== SELF IDENTITY SCORE ===");
  // Build query from same catalog photo
  const clothing = await prisma.clothingItem.findUnique({
    where: { id: ITEM_ID },
    select: { photo: true, originalPhoto: true, name: true, category: true },
  });
  const photoPath = clothing?.originalPhoto || clothing?.photo || "";
  const buffer = await loadPhotoBuffer(photoPath);
  if (!buffer) throw new Error("Could not load Onion Bridal photo");

  const query = await analyzeQueryImage(buffer, undefined, {
    category: clothing?.category || "Lehenga",
    name: clothing?.name || "ONION BRIDAL",
  });

  const identity = searchGarmentIdentity({
    queryViews: query.queryFingerprints,
    queryFingerprint: query.fingerprint,
    inventoryIndex: index,
    inventoryFingerprint: fp,
    partialView: query.partialView ?? "full",
  });

  console.log(
    JSON.stringify(
      {
        identityFinal: identity.identity.final,
        rejected: identity.rejected,
        rejectReason: identity.rejectReason,
        embroidery: identity.identity.embroidery,
        border: identity.identity.border,
        colour: identity.identity.colour,
        motifs: identity.identity.motifs,
        texture: identity.identity.texture,
        deepEmbedding: identity.identity.deepEmbedding,
        queryColourFamily: query.fingerprint.colourFamily,
        queryPrimary: query.fingerprint.primaryColour,
        storedColourFamily: fp.colourFamily,
        storedPrimary: fp.primaryColour,
      },
      null,
      2,
    ),
  );

  console.log("\n=== ENTERPRISE SEARCH (Onion Bridal image) ===");
  const result = await searchInventoryByDressCheckerEnterprise(
    buffer,
    { category: "Lehenga" },
    { debug: true, limit: 20 },
  );

  for (const [i, r] of result.results.entries()) {
    console.log(
      `#${i + 1} ${r.sku} ${r.name} sim=${r.similarity} emb=${r.embedding_score?.toFixed?.(1) ?? r.embedding_score} fg=${r.fine_grained_score} color=${r.color_score} border=${r.border_score} openai=${r.openai_score} band=${r.confidence_band}`,
    );
  }

  const scored = (result.ai_diagnostics as { scored?: Array<{ itemId: number; finalScore: number; fineGrainedScore: number; embeddingScore: number; rejected: boolean; rejectReason?: string }> })?.scored ?? [];
  const self = scored.find((s) => s.itemId === ITEM_ID);
  console.log("\n=== SELF IN SEARCH SHORTLIST ===");
  console.log(JSON.stringify(self, null, 2));

  const checks = {
    recognitionVersionOk: (profile?.recognitionVersion ?? 0) >= 9,
    pipelineVersionOk: String(profile?.pipelineVersion) === "9",
    identificationIndexOk: (index.references?.length ?? 0) > 0,
    embroiderySignatureOk: !!profile?.embroiderySignature,
    borderSignatureOk: !!profile?.borderSignature,
    motifSignatureOk: !!profile?.motifSignature,
    textureSignatureOk: !!profile?.textureSignature,
    stoneSignatureOk: !!profile?.stoneSignature,
    panelSignatureOk: !!profile?.panelSignature,
    identityScoreOk: identity.identity.final > 85,
    selfSearchShown: result.results.some((r) => r.sku === "ITM-1049"),
    selfSearchRank: result.results.findIndex((r) => r.sku === "ITM-1049") + 1 || null,
  };
  console.log("\n=== VERIFICATION CHECKS ===");
  console.log(JSON.stringify(checks, null, 2));

  await prisma.$disconnect();
  if (!checks.recognitionVersionOk || !checks.identificationIndexOk || !checks.identityScoreOk) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
