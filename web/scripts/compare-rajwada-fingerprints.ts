import { readFile } from "fs/promises";

import prisma from "../src/lib/prisma";

import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";

import { parseStoredFingerprint } from "../src/lib/dressChecker/featureExtraction";

import { matchGarmentIdentity } from "../src/lib/dressChecker/identityMatcher";

import { multicolorPanelOverlap } from "../src/lib/photoHash";

import { parseIdentificationIndex } from "../src/lib/dressIdentificationIndex";

import { parseProfileIdentificationIndex } from "../src/lib/dressChecker/services/inventoryAiProfileService";



const DEFAULT =

  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_as-8bc31cee-9d2c-4d16-b8c9-d8e99e4b07dd.png";



async function main() {

  const buffer = await readFile(process.argv[2] || DEFAULT);

  const query = await analyzeQueryImage(buffer, undefined, { category: "Lehenga" });



  const items = await prisma.clothingItem.findMany({

    where: { sku: { in: ["ITM-1040", "ITM-1043", "ITM-0027"] } },

    select: {

      sku: true,

      name: true,

      color: true,

      recognitionFingerprint: true,

      identificationIndex: true,

      aiProfile: { select: { recognitionFingerprint: true, garmentAttributes: true } },

    },

  });



  for (const item of items) {

    const fp =

      parseStoredFingerprint(item.aiProfile?.recognitionFingerprint, item.name, item.color) ||

      parseStoredFingerprint(item.recognitionFingerprint, item.name, item.color);

    const index =

      parseProfileIdentificationIndex(item.aiProfile?.garmentAttributes) ||

      parseIdentificationIndex(item.identificationIndex);

    if (!fp || !index?.references?.length) {

      console.log(item.sku, "MISSING DATA");

      continue;

    }

    const identity = matchGarmentIdentity(

      query.queryFingerprints,

      query.fingerprint,

      index,

      fp,

      item.name,

      item.color,

    );

    const panel = multicolorPanelOverlap(query.fingerprint.colourHistogram, fp.colourHistogram);

    console.log(item.sku, item.name, {

      storedFamily: fp.colourFamily,

      primary: fp.primaryColour,

      panel,

      final: identity.final,

      embroidery: identity.embroidery,

      border: identity.border,

    });

  }

}



main().catch(console.error);


