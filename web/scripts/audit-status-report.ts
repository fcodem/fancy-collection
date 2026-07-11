import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 1. PGVECTOR EXTENSION ===");
  const extensions = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
    `SELECT extname FROM pg_extension ORDER BY extname`,
  );
  console.log(JSON.stringify(extensions, null, 2));

  console.log("\n=== 1b. inventory_ai_profiles COLUMNS ===");
  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'inventory_ai_profiles'
     ORDER BY ordinal_position`,
  );
  const wanted = [
    "embedding_vector",
    "dominant_color",
    "border_signature",
    "motif_signature",
    "texture_signature",
    "last_indexed_at",
    "matching_version",
  ];
  for (const w of wanted) {
    const found = cols.find((c) => c.column_name === w);
    console.log(`${w}: ${found ? found.data_type : "MISSING"}`);
  }

  console.log("\n=== 2. INDEXING COUNTS ===");
  const inventoryCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM clothing_items`,
  );
  const profileCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM inventory_ai_profiles`,
  );
  const embCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM inventory_ai_profiles WHERE embedding_vector IS NOT NULL`,
  );
  console.log("clothing_items (inventory):", String(inventoryCount[0]?.count ?? 0));
  console.log("inventory_ai_profiles:", String(profileCount[0]?.count ?? 0));
  console.log("with embedding_vector:", String(embCount[0]?.count ?? 0));

  const withPhoto = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM clothing_items WHERE photo IS NOT NULL AND photo <> ''`,
  );
  console.log("clothing_items with photo:", String(withPhoto[0]?.count ?? 0));

  console.log("\n=== 2b. MODEL VERSIONS ===");
  const models = await prisma.$queryRawUnsafe<Array<{ model_version: string; cnt: bigint }>>(
    `SELECT model_version, COUNT(*)::bigint AS cnt
     FROM inventory_ai_profiles
     WHERE model_version IS NOT NULL
     GROUP BY model_version`,
  );
  console.log(JSON.stringify(models, null, 2));

  console.log("\n=== 2c. PIPELINE / SIGNATURE DATA ===");
  let sigColsExist = cols.some((c) => c.column_name === "embroidery_signature");
  if (sigColsExist) {
    const sigCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM inventory_ai_profiles WHERE embroidery_signature IS NOT NULL`,
    );
    console.log("embroidery_signature populated:", String(sigCount[0]?.count ?? 0));
  } else {
    console.log("embroidery_signature column: MISSING (migration not applied)");
  }

  const withIndex = await prisma.inventoryAiProfile.findMany({
    select: { itemId: true, pipelineVersion: true, recognitionVersion: true, garmentAttributes: true },
  });
  const idIndexCount = withIndex.filter((p) => {
    const ga = p.garmentAttributes as { identificationIndex?: { references?: unknown[] } } | null;
    return (ga?.identificationIndex?.references?.length ?? 0) > 0;
  }).length;
  console.log("profiles with identificationIndex in garmentAttributes:", idIndexCount);
  console.log("pipeline versions:", [...new Set(withIndex.map((p) => p.pipelineVersion))]);
  console.log("recognition versions:", [...new Set(withIndex.map((p) => p.recognitionVersion))]);

  console.log("\n=== 8. UNINDEXED ===");
  const unindexed = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (p.item_id IS NULL OR p.embedding_vector IS NULL)`,
  );
  console.log("items with photo but no embedding:", String(unindexed[0]?.count ?? 0));

  const noProfile = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> '' AND p.item_id IS NULL`,
  );
  console.log("items with photo but no ai profile:", String(noProfile[0]?.count ?? 0));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
