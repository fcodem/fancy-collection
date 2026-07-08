import { readFile } from "fs/promises";
import { identificationPhotoSearch } from "../src/lib/services/dressIdentificationPipeline";

const DEFAULT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_as-8bc31cee-9d2c-4d16-b8c9-d8e99e4b07dd.png";

async function main() {
  const buffer = await readFile(process.argv[2] || DEFAULT);
  const result = await identificationPhotoSearch(buffer, { category: "Lehenga" }, { debug: true });
  console.log("Decision:", result.identification_meta?.decision, result.best_similarity);
  const dbg = result.dress_checker_debug;
  if (dbg?.topMatches) {
    for (const m of dbg.topMatches) {
      console.log(
        `${m.rank}. ${m.sku} ${m.finalScore}% visual=${m.globalScore} colour=${m.colorScore} emb=${m.embroideryScore} border=${m.borderScore}`,
      );
    }
  }
  if (dbg?.queryFingerprint) {
    const q = dbg.queryFingerprint as Record<string, unknown>;
    console.log("Query:", {
      colourFamily: q.colourFamily,
      primaryColour: q.primaryColour,
      embroideryStyle: q.embroideryStyle,
      category: q.category,
    });
  }
  if (dbg?.candidateFilterStages) {
    console.log("Filters:", dbg.candidateFilterStages.map((s) => `${s.name}:${s.before}→${s.after}`).join(" · "));
  }
}

main().catch(console.error);
