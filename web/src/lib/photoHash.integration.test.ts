import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeImageFingerprint,
  colorMatchScore,
  colorFamilyMatchScore,
  finalPhotoSearchScore,
  blendVisualSearchScore,
  designSimilarity,
  multicolorPanelOverlap,
  histogramIndicatesMulti,
} from "./photoHash";

const GREEN_FLOOR =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_9116-f66ef0b8-e067-429e-a0a6-60d3c64f3fe6.png";
const GREEN_HANGER =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_7EB06CF6-1FE5-4AA6-A842-ABA1061489D7-3f9217b2-f5a1-401c-ba1f-ca88af75550b.png";
const BLUE_CUTDANA2 =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_9115-b2fed11b-8151-4115-99bf-d5ee006d88b6.png";
const PEACOCK_UPLOAD =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-6f89c1f3-969b-410e-a1be-f1993c3016f6.png";
const BRIDAL_SCREENSHOT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_MIS-6d698e03-3e31-48f8-8fb1-0c5166226b06.png";

const META_UPLOAD =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_META-51995eef-bd72-46b6-9dc6-7df4244453cb.png";

const FIXTURES_OK = [
  GREEN_FLOOR,
  GREEN_HANGER,
  BLUE_CUTDANA2,
  PEACOCK_UPLOAD,
  BRIDAL_SCREENSHOT,
  META_UPLOAD,
].every((p) => existsSync(p));

/** Current inventory SKUs (renumbered after re-import). */
const SKU = {
  BLUE_CUTDANA_2: "ITM-1035",
  BLUE_CUTDANA: "ITM-1042",
  PISTA: "ITM-1046",
  RAJWADA: "ITM-1047",
  FLORAL_CT: "ITM-0027",
} as const;

async function loadCatalogPhoto(photo: string) {
  return readFile(join(process.cwd(), "public", "uploads", photo.replace(/^uploads\//, "")));
}

async function scoreAgainstSkus(queryPath: string, skus: string[]) {
  const query = await computeImageFingerprint(await readFile(queryPath));
  const prisma = new PrismaClient();
  const items = await prisma.clothingItem.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, photo: true },
  });

  const scores: Record<string, number> = {};
  // Only treat as multi when the primary family is multi — green/blue bodies with
  // gold zari can trip histogramIndicatesMulti without being bridal multi-panel.
  const queryIsMulti = query.colorFamily === "multi";
  for (const item of items) {
    if (!item.photo) continue;
    const stored = await computeImageFingerprint(await loadCatalogPhoto(item.photo));
    const colorScore = colorMatchScore(query, stored);
    const colorFamilyScore = colorFamilyMatchScore(query.colorFamily, stored.colorFamily);
    const familyScore =
      queryIsMulti && stored.colorFamily === "green" ? 0 : colorFamilyScore;
    const designScore = designSimilarity(query, stored);
    const panelOverlap = multicolorPanelOverlap(query.colorHistogram, stored.colorHistogram);
    const visual = blendVisualSearchScore(colorScore, designScore);
    scores[item.sku] = finalPhotoSearchScore(
      0,
      visual,
      colorScore,
      designScore,
      familyScore,
      query.colorFamily,
      stored.colorFamily,
      panelOverlap,
    );
  }
  await prisma.$disconnect();
  return { queryFamily: query.colorFamily, scores };
}

async function scoreAgainstCatalog(queryPath: string) {
  return scoreAgainstSkus(queryPath, [SKU.BLUE_CUTDANA_2, SKU.BLUE_CUTDANA, SKU.PISTA]);
}

describe("green lehenga integration", { skip: !FIXTURES_OK }, () => {
  it("ranks PISTA above blue CUTDANAs for floor photo", async () => {
    const { scores } = await scoreAgainstCatalog(GREEN_FLOOR);
    assert.ok((scores[SKU.PISTA] ?? 0) > (scores[SKU.BLUE_CUTDANA] ?? 0));
    assert.ok((scores[SKU.PISTA] ?? 0) > (scores[SKU.BLUE_CUTDANA_2] ?? 0));
    assert.ok((scores[SKU.BLUE_CUTDANA] ?? 0) <= 12);
  });

  it("ranks PISTA above blue CUTDANAs for hanger photo", async () => {
    const { scores } = await scoreAgainstCatalog(GREEN_HANGER);
    assert.ok((scores[SKU.PISTA] ?? 0) > (scores[SKU.BLUE_CUTDANA] ?? 0));
    assert.ok((scores[SKU.BLUE_CUTDANA] ?? 0) <= 12);
  });
});

describe("blue cutdana integration", { skip: !FIXTURES_OK }, () => {
  it("ranks CUTDANA 2 above CUTDANA for blue query when AI pattern applied", async () => {
    const { scores } = await scoreAgainstCatalog(BLUE_CUTDANA2);
    const cutdana2 = finalPhotoSearchScore(88, scores[SKU.BLUE_CUTDANA_2] ?? 0, 85, 43, 100, "blue", "blue");
    const cutdana = finalPhotoSearchScore(52, scores[SKU.BLUE_CUTDANA] ?? 0, 80, 67, 100, "blue", "blue");
    assert.ok(cutdana2 > cutdana);
  });
});

describe("multi bridal Dn 7967", { skip: !FIXTURES_OK }, () => {
  it("ranks MULTI RAJWADA above FLORAL CT and blue CUTDANAs", async () => {
    const { queryFamily, scores } = await scoreAgainstSkus(PEACOCK_UPLOAD, [
      SKU.RAJWADA,
      SKU.FLORAL_CT,
      SKU.BLUE_CUTDANA_2,
      SKU.BLUE_CUTDANA,
    ]);
    assert.equal(queryFamily, "multi");
    assert.ok((scores[SKU.RAJWADA] ?? 0) > (scores[SKU.FLORAL_CT] ?? 0));
    assert.ok((scores[SKU.RAJWADA] ?? 0) > (scores[SKU.BLUE_CUTDANA] ?? 0));
    assert.ok((scores[SKU.BLUE_CUTDANA] ?? 0) <= 12);
  });

  it("ranks MULTI RAJWADA above FLORAL CT for phone screenshot upload", async () => {
    const { scores } = await scoreAgainstSkus(BRIDAL_SCREENSHOT, [SKU.RAJWADA, SKU.FLORAL_CT]);
    assert.ok((scores[SKU.RAJWADA] ?? 0) > (scores[SKU.FLORAL_CT] ?? 0));
    assert.ok((scores[SKU.RAJWADA] ?? 0) >= 50);
  });

  it("ranks MULTI RAJWADA above PISTA SIKKIYA for META phone upload", async () => {
    const { scores } = await scoreAgainstSkus(META_UPLOAD, [SKU.RAJWADA, SKU.PISTA, SKU.FLORAL_CT]);
    assert.ok((scores[SKU.RAJWADA] ?? 0) > (scores[SKU.PISTA] ?? 0));
    assert.ok((scores[SKU.PISTA] ?? 0) <= 12);
  });
});
