import { PrismaClient } from "@prisma/client";
import {
  isPgvectorAvailable,
  isReferencePhotoPgvectorAvailable,
  getDressCheckerIndexStats,
} from "../src/lib/ai/pgvector";

const prisma = new PrismaClient();

async function main() {
  const pgOk = await isPgvectorAvailable();
  const refPgOk = await isReferencePhotoPgvectorAvailable();
  const stats = await getDressCheckerIndexStats();

  const extRow = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`,
  );
  const ext = !!extRow[0]?.exists;

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='inventory_ai_profiles'
     AND column_name IN ('embedding_vector','dominant_color','embroidery_signature','matching_version','image_embedding_json')`,
  );
  const colNames = cols.map((r) => r.column_name);

  const refCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_schema='public' AND table_name='clothing_item_reference_photos'
     AND column_name IN ('embedding_vector','embedding_json')`,
  );
  const refColNames = refCols.map((r) => r.column_name);

  const totalItems = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const withJsonEmb = await prisma.inventoryAiProfile.count({
    where: { imageEmbeddingJson: { not: null } },
  });

  let withSig = 0;
  let withDomColor = 0;
  let matchingV9 = 0;
  try {
    withSig = await prisma.inventoryAiProfile.count({
      where: { embroiderySignature: { not: null } },
    });
    withDomColor = await prisma.inventoryAiProfile.count({
      where: { dominantColor: { not: null } },
    });
    matchingV9 = await prisma.inventoryAiProfile.count({
      where: { matchingVersion: { gte: 9 } },
    });
  } catch {
    // migration not applied yet
  }

  let refWithEmb = 0;
  if (refColNames.includes("embedding_vector") && pgOk) {
    const refRows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM clothing_item_reference_photos WHERE embedding_vector IS NOT NULL`,
    );
    refWithEmb = refRows[0]?.c ?? 0;
  }

  const modelVersions = await prisma.inventoryAiProfile.groupBy({
    by: ["modelVersion"],
    _count: true,
    where: { modelVersion: { not: null } },
  });

  const profiles = await prisma.inventoryAiProfile.findMany({
    select: {
      itemId: true,
      pipelineVersion: true,
      recognitionVersion: true,
      recognitionFingerprint: true,
      garmentAttributes: true,
    },
  });
  const withIndex = profiles.filter((pr) => {
    const ga = pr.garmentAttributes as { identificationIndex?: { references?: unknown[] } } | null;
    return (ga?.identificationIndex?.references?.length ?? 0) > 0;
  }).length;
  const withFp = profiles.filter((pr) => pr.recognitionFingerprint != null).length;
  const refPhotoCount = await prisma.clothingItemReferencePhoto.count();

  const pgvectorCount = pgOk
    ? await prisma.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM inventory_ai_profiles WHERE embedding_vector IS NOT NULL`,
      )
    : [{ c: 0 }];

  console.log(
    JSON.stringify(
      {
        pgvectorExtension: ext,
        pgvectorRuntimeOk: pgOk,
        embeddingVectorColumn: colNames.includes("embedding_vector"),
        signatureColumns:
          colNames.includes("dominant_color") && colNames.includes("embroidery_signature"),
        matchingVersionColumn: colNames.includes("matching_version"),
        refEmbeddingColumn: refColNames.includes("embedding_vector"),
        refPgvectorRuntimeOk: refPgOk,
        stats,
        totalItemsWithPhoto: totalItems,
        pgvectorEmbeddingsStored: pgvectorCount[0]?.c ?? 0,
        profilesWithJsonEmbedding: withJsonEmb,
        profilesWithEmbroiderySignature: withSig,
        profilesWithDominantColor: withDomColor,
        profilesMatchingVersion9Plus: matchingV9,
        refPhotosWithEmbedding: refWithEmb,
        referencePhotoRows: refPhotoCount,
        profilesWithIdentificationIndex: withIndex,
        profilesWithRecognitionFingerprint: withFp,
        pipelineVersions: [...new Set(profiles.map((p) => p.pipelineVersion))],
        recognitionVersions: [...new Set(profiles.map((p) => p.recognitionVersion))],
        modelVersions,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
