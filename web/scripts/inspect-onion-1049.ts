import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const item = await prisma.clothingItem.findFirst({
    where: { sku: "ITM-1049" },
    select: {
      id: true,
      sku: true,
      name: true,
      photo: true,
      originalPhoto: true,
      recognitionImage: true,
      identificationIndex: true,
      identificationIndexedAt: true,
      siglipIndexedAt: true,
      aiProfile: true,
    },
  });

  const ga = item?.aiProfile?.garmentAttributes as {
    identificationIndex?: { references?: unknown[] };
  } | null;

  console.log(
    JSON.stringify(
      {
        id: item?.id,
        sku: item?.sku,
        name: item?.name,
        photo: item?.photo,
        originalPhoto: item?.originalPhoto,
        recognitionImage: item?.recognitionImage,
        hasItemIdentificationIndex: !!(item?.identificationIndex as { references?: unknown[] } | null)
          ?.references?.length,
        identificationIndexedAt: item?.identificationIndexedAt,
        siglipIndexedAt: item?.siglipIndexedAt,
        profile: item?.aiProfile
          ? {
              status: item.aiProfile.status,
              pipelineVersion: item.aiProfile.pipelineVersion,
              recognitionVersion: item.aiProfile.recognitionVersion,
              modelVersion: item.aiProfile.modelVersion,
              error: item.aiProfile.error,
              processingError: item.aiProfile.processingError,
              hasRecognitionFingerprint: !!item.aiProfile.recognitionFingerprint,
              hasGarmentAttributesIndex: (ga?.identificationIndex?.references?.length ?? 0) > 0,
              colourAnalysis: item.aiProfile.colourAnalysis,
              reindexedAt: item.aiProfile.reindexedAt,
              lastProcessed: item.aiProfile.lastProcessed,
              verificationMetadata: item.aiProfile.verificationMetadata,
            }
          : null,
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
