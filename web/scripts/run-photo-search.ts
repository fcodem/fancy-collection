/**
 * Full identification search ranking for a query image.
 * Run: npx tsx scripts/run-photo-search.ts [image-path]
 */
import { readFile } from "fs/promises";
import { identificationPhotoSearch } from "../src/lib/services/dressIdentificationPipeline";

const DEFAULT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_as-8bc31cee-9d2c-4d16-b8c9-d8e99e4b07dd.png";

async function main() {
  const path = process.argv[2] || DEFAULT;
  const buffer = await readFile(path);
  const result = await identificationPhotoSearch(buffer, { category: "Lehenga" });
  const all = [...result.category_results, ...result.other_results];
  console.log(`Decision: ${result.identification_meta?.decision} top=${result.best_similarity}%`);
  console.log(`Results (${all.length}):`);
  for (const m of all) {
    console.log(`  ${m.sku} ${m.name} ${m.similarity}% — ${m.rank_reason?.slice(0, 80)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
