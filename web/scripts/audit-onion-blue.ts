import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.clothingItem.findMany({
    where: {
      OR: [
        { name: { contains: "Onion", mode: "insensitive" } },
        { name: { contains: "Cutdana", mode: "insensitive" } },
        { name: { contains: "Bridal", mode: "insensitive" } },
        { color: { contains: "pink", mode: "insensitive" } },
        { color: { contains: "blue", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      color: true,
      category: true,
      photo: true,
      aiProfile: {
        select: {
          status: true,
          modelVersion: true,
          pipelineVersion: true,
          recognitionVersion: true,
          colourAnalysis: true,
          recognitionFingerprint: true,
          garmentAttributes: true,
          photoHash: true,
          reindexedAt: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  for (const item of items) {
    const fp = item.aiProfile?.recognitionFingerprint as Record<string, unknown> | null;
    const colour = item.aiProfile?.colourAnalysis as Record<string, unknown> | null;
    const ga = item.aiProfile?.garmentAttributes as {
      identificationIndex?: { references?: unknown[] };
    } | null;
    console.log(
      JSON.stringify(
        {
          id: item.id,
          sku: item.sku,
          name: item.name,
          color: item.color,
          category: item.category,
          hasPhoto: !!item.photo,
          profileStatus: item.aiProfile?.status ?? null,
          modelVersion: item.aiProfile?.modelVersion ?? null,
          pipelineVersion: item.aiProfile?.pipelineVersion ?? null,
          recognitionVersion: item.aiProfile?.recognitionVersion ?? null,
          colourAnalysis: colour,
          primaryColour: fp?.primaryColour ?? null,
          secondaryColour: fp?.secondaryColour ?? null,
          colourFamily: fp?.colourFamily ?? null,
          embroideryStyle: fp?.embroideryStyle ?? null,
          embroideryDensity: fp?.embroideryDensity ?? null,
          hasIdentificationIndex: (ga?.identificationIndex?.references?.length ?? 0) > 0,
          reindexedAt: item.aiProfile?.reindexedAt ?? null,
        },
        null,
        2,
      ),
    );
  }

  // Also dump all indexed items for ranking context
  console.log("\n=== ALL INDEXED ITEMS ===");
  const all = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: {
      id: true,
      sku: true,
      name: true,
      color: true,
      category: true,
      aiProfile: {
        select: {
          colourAnalysis: true,
          recognitionFingerprint: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
  for (const item of all) {
    const fp = item.aiProfile?.recognitionFingerprint as Record<string, unknown> | null;
    const colour = item.aiProfile?.colourAnalysis as Record<string, unknown> | null;
    console.log(
      `${item.id}\t${item.sku}\t${item.name}\tcolor=${item.color}\tfpFamily=${fp?.colourFamily ?? "-"}\tprimary=${fp?.primaryColour ?? colour?.primary ?? "-"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
