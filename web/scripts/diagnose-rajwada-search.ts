/**

 * Diagnose MULTI RAJWADA vs lookalikes for a query image (v5 identity matcher).

 * Run: npx tsx scripts/diagnose-rajwada-search.ts [image-path]

 */

import { readFile } from "fs/promises";

import { PrismaClient } from "@prisma/client";

import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";

import { parseStoredFingerprint } from "../src/lib/dressChecker/featureExtraction";

import { matchGarmentIdentity } from "../src/lib/dressChecker/identityMatcher";

import { parseIdentificationIndex } from "../src/lib/dressIdentificationIndex";

import { parseProfileIdentificationIndex } from "../src/lib/dressChecker/services/inventoryAiProfileService";

import {

  histogramIndicatesMulti,

  multicolorPanelOverlap,

} from "../src/lib/photoHash";

import { inventoryStyleAffinity } from "../src/lib/inventorySearchAffinity";



const DEFAULT_IMAGE =

  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-3e9f211d-ab39-4dab-90b5-8f44f570c844.png";



const TARGET_SKUS = ["ITM-1043", "ITM-0027", "ITM-1040", "ITM-1035", "ITM-0028", "ITM-1036"];



async function main() {

  const imagePath = process.argv[2] || DEFAULT_IMAGE;

  const buffer = await readFile(imagePath);

  const prisma = new PrismaClient();



  const queryPipeline = await analyzeQueryImage(buffer, undefined, { category: "Lehenga" });

  const qfp = queryPipeline.fingerprint;



  console.log("QUERY fingerprint:");

  console.log("  colourFamily:", qfp.colourFamily);

  console.log("  histogramMulti:", histogramIndicatesMulti(qfp.colourHistogram));

  console.log("  primary:", qfp.primaryColour);

  console.log("  embroidery:", qfp.embroideryStyle, qfp.embroideryDensity);



  const items = await prisma.clothingItem.findMany({

    where: { sku: { in: TARGET_SKUS } },

    select: {

      id: true,

      sku: true,

      name: true,

      color: true,

      identificationIndex: true,

      recognitionFingerprint: true,

      aiProfile: {

        select: {

          recognitionFingerprint: true,

          recognitionVersion: true,

          garmentAttributes: true,

        },

      },

    },

  });



  const ranked: Array<{ sku: string; name: string; final: number; identity: ReturnType<typeof matchGarmentIdentity> }> = [];



  for (const sku of TARGET_SKUS) {

    const item = items.find((i) => i.sku === sku);

    if (!item) {

      console.log(`\n${sku}: NOT IN DB`);

      continue;

    }

    const index =

      parseProfileIdentificationIndex(item.aiProfile?.garmentAttributes) ||

      parseIdentificationIndex(item.identificationIndex);

    const storedFp =

      parseStoredFingerprint(item.aiProfile?.recognitionFingerprint, item.name, item.color) ||

      parseStoredFingerprint(item.recognitionFingerprint, item.name, item.color);



    if (!index?.references?.length) {

      console.log(`\n${sku}: NO INDEX`);

      continue;

    }



    const identity = matchGarmentIdentity(

      queryPipeline.queryFingerprints,

      qfp,

      index,

      storedFp,

      item.name,

      item.color,

    );



    const panel = storedFp

      ? multicolorPanelOverlap(qfp.colourHistogram, storedFp.colourHistogram)

      : 0;

    const affinity = inventoryStyleAffinity(item.name, qfp, item.color);



    ranked.push({ sku, name: item.name, final: identity.final, identity });



    console.log(`\n${sku} ${item.name}`);

    console.log("  final:", identity.final);

    console.log("  embroidery/border/texture:", identity.embroidery, identity.border, identity.texture);

    console.log("  deepEmbedding:", identity.deepEmbedding, "colour:", identity.colour);

    console.log("  panelOverlap:", panel, "styleAffinity:", affinity);

    console.log("  bestView:", identity.bestRefLabel, identity.bestQuerySource);

  }



  ranked.sort((a, b) => b.final - a.final);

  console.log("\n--- RANKING ---");

  for (const [i, r] of ranked.entries()) {

    console.log(`${i + 1}. ${r.sku} ${r.final}%`);

  }



  await prisma.$disconnect();

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


