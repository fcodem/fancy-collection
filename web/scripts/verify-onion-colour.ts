/**
 * Verify LAB dress-mask colour detection on ONION BRIDAL.
 */
import { PrismaClient } from "@prisma/client";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { detectAndIsolateGarment } from "../src/lib/dressChecker/imageProcessing";
import { extractFeatureFingerprint } from "../src/lib/dressChecker/featureExtraction";
import { extractDressColoursLab, formatColourDiagnostics } from "../src/lib/dressChecker/dressColourLab";

const prisma = new PrismaClient();

async function main() {
  const item = await prisma.clothingItem.findFirst({
    where: { sku: "ITM-1049" },
    select: { id: true, sku: true, name: true, photo: true, originalPhoto: true, category: true, subCategory: true },
  });
  if (!item?.photo) throw new Error("ONION BRIDAL not found");

  const buf = await loadPhotoBuffer(item.originalPhoto || item.photo);
  if (!buf) throw new Error("photo missing");

  console.log("=== RAW IMAGE LAB EXTRACTION ===");
  const raw = await extractDressColoursLab(buf);
  console.log(formatColourDiagnostics(raw.diagnostics));

  console.log("\n=== AFTER GARMENT ISOLATION ===");
  const garment = await detectAndIsolateGarment(buf);
  const isolated = await extractDressColoursLab(garment.buffer);
  console.log(formatColourDiagnostics(isolated.diagnostics));

  console.log("\n=== FULL FINGERPRINT PATH ===");
  const fp = await extractFeatureFingerprint(garment, item.category, item.name, item.subCategory);
  console.log(
    JSON.stringify(
      {
        primaryColour: fp.primaryColour,
        secondaryColour: fp.secondaryColour,
        colourFamily: fp.colourFamily,
        diagnostics: fp.colourDiagnostics,
      },
      null,
      2,
    ),
  );

  if (fp.colourFamily !== "pink") {
    console.error("FAIL: expected pink family, got", fp.colourFamily);
    process.exit(2);
  }
  console.log("\nPASS: colourFamily=pink");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
