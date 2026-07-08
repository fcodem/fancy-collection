/**
 * Proves Claude Vision distinguishes same-physical-dress from lookalikes
 * on the exact cases where all offline embeddings failed.
 * Run: npx tsx scripts/vlm-validate.ts
 */
import { config } from "dotenv";
import { readFile } from "fs/promises";
config({ path: ".env.local" });
config({ path: ".env" });

import { verifyDressIdentity, isVlmAvailable } from "../src/lib/dressChecker/vlmIdentity";

const ASSET = "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/";
const IMG = {
  green1: ASSET + "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_6605-3ac0b7a8-8e58-4a4d-bc52-ccb00bf1cc98.png",
  green2: ASSET + "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_9117-bdef2727-dbbd-4da9-8664-79cd071092d7.png",
  bridal: ASSET + "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-4e4322da-4287-4e72-aad4-af558d70c44a.png",
  mannequin: ASSET + "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_7851-dd640154-4f03-4b07-a7f4-032af0cbca9a.png",
};

async function main() {
  console.log("VLM available:", isVlmAvailable());
  if (!isVlmAvailable()) {
    console.log("ANTHROPIC_API_KEY not set — cannot validate VLM here.");
    return;
  }
  const query = await readFile(IMG.green1); // folded green lehenga on floor
  const candidates = [
    { itemId: 1, sku: "GREEN-SAME", name: "Green Lehenga (hanging, same dress)", images: [await readFile(IMG.green2)] },
    { itemId: 2, sku: "BRIDAL-DIFF", name: "Peach Bridal Lehenga", images: [await readFile(IMG.bridal)] },
    { itemId: 3, sku: "MANNQ-DIFF", name: "Mannequin Bridal", images: [await readFile(IMG.mannequin)] },
  ];

  const verdict = await verifyDressIdentity(query, candidates);
  console.log("\n=== VERDICT ===");
  console.log("matchItemId:", verdict.matchItemId, "(expect 1 = GREEN-SAME)");
  console.log("confidence:", verdict.confidence);
  console.log("reasoning:", verdict.reasoning);
  console.log("per-candidate:");
  for (const p of verdict.perCandidate) {
    console.log(`  ${p.sku}: sameDress=${p.sameDress} conf=${p.confidence} — ${p.notes}`);
  }
  if (verdict.error) console.log("error:", verdict.error);
}

main().catch((e) => { console.error(e); process.exit(1); });
