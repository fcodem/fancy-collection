import { readFile } from "fs/promises";
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
  const queryIsMulti =
    query.colorFamily === "multi" || histogramIndicatesMulti(query.colorHistogram);
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
  return scoreAgainstSkus(queryPath, ["ITM-1035", "ITM-1036", "ITM-1037"]);
}

describe("green lehenga integration", () => {
  it("ranks PISTA above blue CUTDANAs for floor photo", async () => {
    const { scores } = await scoreAgainstCatalog(GREEN_FLOOR);
    assert.ok((scores["ITM-1037"] ?? 0) > (scores["ITM-1036"] ?? 0));
    assert.ok((scores["ITM-1037"] ?? 0) > (scores["ITM-1035"] ?? 0));
    assert.ok((scores["ITM-1036"] ?? 0) <= 12);
  });

  it("ranks PISTA above blue CUTDANAs for hanger photo", async () => {
    const { scores } = await scoreAgainstCatalog(GREEN_HANGER);
    assert.ok((scores["ITM-1037"] ?? 0) > (scores["ITM-1036"] ?? 0));
    assert.ok((scores["ITM-1036"] ?? 0) <= 12);
  });
});

describe("blue cutdana integration", () => {
  it("ranks CUTDANA 2 above CUTDANA 3 for blue query when AI pattern applied", async () => {
    const { scores } = await scoreAgainstCatalog(BLUE_CUTDANA2);
    const cutdana2 = finalPhotoSearchScore(88, scores["ITM-1035"] ?? 0, 85, 43, 100, "blue", "blue");
    const cutdana3 = finalPhotoSearchScore(52, scores["ITM-1036"] ?? 0, 80, 67, 100, "blue", "blue");
    assert.ok(cutdana2 > cutdana3);
  });
});

describe("multi bridal Dn 7967", () => {
  it("ranks MULTI RAJWADA above FLORAL CT and blue CUTDANAs", async () => {
    const { queryFamily, scores } = await scoreAgainstSkus(PEACOCK_UPLOAD, [
      "ITM-1043",
      "ITM-0027",
      "ITM-1035",
      "ITM-1036",
    ]);
    assert.equal(queryFamily, "multi");
    assert.ok((scores["ITM-1043"] ?? 0) > (scores["ITM-0027"] ?? 0));
    assert.ok((scores["ITM-1043"] ?? 0) > (scores["ITM-1036"] ?? 0));
    assert.ok((scores["ITM-1036"] ?? 0) <= 12);
  });

  it("ranks MULTI RAJWADA above FLORAL CT for phone screenshot upload", async () => {
    const { scores } = await scoreAgainstSkus(BRIDAL_SCREENSHOT, ["ITM-1043", "ITM-0027"]);
    assert.ok((scores["ITM-1043"] ?? 0) > (scores["ITM-0027"] ?? 0));
    assert.ok((scores["ITM-1043"] ?? 0) >= 50);
  });

  it("ranks MULTI RAJWADA above PISTA SIKKIYA for META phone upload", async () => {
    const META =
      "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_META-51995eef-bd72-46b6-9dc6-7df4244453cb.png";
    const { scores } = await scoreAgainstSkus(META, ["ITM-1043", "ITM-1037", "ITM-0027"]);
    assert.ok((scores["ITM-1043"] ?? 0) > (scores["ITM-1037"] ?? 0));
    assert.ok((scores["ITM-1037"] ?? 0) <= 12);
  });
});
