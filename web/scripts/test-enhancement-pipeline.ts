/**
 * End-to-end enhancement pipeline test for one inventory item.
 * Usage: npx tsx scripts/test-enhancement-pipeline.ts [itemId]
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { runInventoryImageEnhancement } from "../src/lib/ai/enhancementPipeline";
import { catalogPhotoRef } from "../src/lib/catalogPhotoRef";
import { verifyEnhancedPath } from "../src/lib/ai/enhancementStorage";

const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const itemId = parseInt(process.argv[2] || "1048", 10);

async function main() {
  const prisma = new PrismaClient();

const item = await prisma.clothingItem.findUnique({
  where: { id: itemId },
  select: {
    id: true,
    name: true,
    photo: true,
    category: true,
    itemType: true,
    enhancementStatus: true,
    enhancedPhoto: true,
  },
});

if (!item) {
  console.error("Item not found:", itemId);
  process.exit(1);
}

console.log("Testing item:", item.name, `(id=${itemId})`);
const result = await runInventoryImageEnhancement(itemId, item, "e2e_test");

const reloaded = await prisma.clothingItem.findUnique({
  where: { id: itemId },
  select: {
    photo: true,
    enhancedPhoto: true,
    enhancementStatus: true,
    enhancementError: true,
  },
});

const catalogRef = catalogPhotoRef(reloaded);
const fileVerify = verifyEnhancedPath(reloaded?.enhancedPhoto);

const logs = await prisma.inventoryAiProfileLog.findMany({
  where: { itemId },
  orderBy: { id: "desc" },
  take: 10,
  select: { event: true, message: true, createdAt: true },
});

console.log(
  JSON.stringify(
    {
      result,
      reloaded,
      catalogPhotoRef: catalogRef,
      usesEnhanced: catalogRef === reloaded?.enhancedPhoto,
      fileVerify,
      recentLogs: logs,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
