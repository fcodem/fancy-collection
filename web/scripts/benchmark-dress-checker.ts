/**
 * Dress Checker performance & accuracy benchmark.
 * Run: npx tsx scripts/benchmark-dress-checker.ts
 */
import { readFile, access, writeFile } from "fs/promises";
import { PrismaClient } from "@prisma/client";
import { identificationPhotoSearch } from "../src/lib/services/dressIdentificationPipeline";

const ASSET_ROOT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets";

const SCALE_TARGETS = [100, 500, 1000, 5000];

const EVAL_CASES = [
  {
    name: "PISTA floor",
    path: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_9116-f66ef0b8-e067-429e-a0a6-60d3c64f3fe6.png`,
    expectedSku: "ITM-1037",
  },
  {
    name: "PISTA hanger",
    path: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_7EB06CF6-1FE5-4AA6-A842-ABA1061489D7-3f9217b2-f5a1-401c-ba1f-ca88af75550b.png`,
    expectedSku: "ITM-1037",
  },
  {
    name: "MULTI RAJWADA",
    path: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-6f89c1f3-969b-410e-a1be-f1993c3016f6.png`,
    expectedSku: "ITM-1043",
  },
];

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function measureSearch(buffer: Buffer) {
  const memBefore = process.memoryUsage().rss;
  const result = await identificationPhotoSearch(buffer, {}, { debug: true });
  const memAfter = process.memoryUsage().rss;
  return {
    result,
    memoryMb: Math.round(memAfter / 1024 / 1024),
    memoryDeltaMb: Math.round((memAfter - memBefore) / 1024 / 1024),
    embedMs: result.dress_checker_debug?.embeddingGenerationMs ?? 0,
    searchMs: result.dress_checker_debug?.searchMs ?? 0,
    candidates: result.dress_checker_debug?.inventoryImagesUsed ?? 0,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const catalogSize = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const indexed = await prisma.clothingItem.count({
    where: { identificationIndexedAt: { not: null } },
  });
  await prisma.$disconnect();

  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    catalog_size: catalogSize,
    indexed_items: indexed,
    scale_projections: SCALE_TARGETS.map((n) => ({
      target_catalog: n,
      note:
        n <= catalogSize
          ? "measured"
          : `projected linear from ${catalogSize} items — re-run after seeding`,
    })),
    accuracy: { top1: 0, top5: 0, cases: 0, false_positives: 0, false_negatives: 0 },
    timing: { embed_ms: [] as number[], search_ms: [] as number[] },
    memory_mb: process.memoryUsage().rss / 1024 / 1024,
  };

  let top1 = 0;
  let top5 = 0;
  let ran = 0;
  let fp = 0;
  let fn = 0;

  for (const c of EVAL_CASES) {
    if (!(await exists(c.path))) {
      console.log(`SKIP ${c.name}`);
      continue;
    }
    const buffer = await readFile(c.path);
    const { result, embedMs, searchMs, memoryMb } = await measureSearch(buffer);
    (report.timing as { embed_ms: number[] }).embed_ms.push(embedMs);
    (report.timing as { search_ms: number[] }).search_ms.push(searchMs);
    report.memory_mb = memoryMb;

    const matches = result.dress_checker_debug?.topMatches || [];
    const topSku = matches[0]?.sku;
    const inTop5 = matches.slice(0, 5).some((m) => m.sku === c.expectedSku);
    ran++;
    if (topSku === c.expectedSku) top1++;
    else {
      fn++;
      if (topSku) fp++;
    }
    if (inTop5) top5++;

    console.log(
      `${c.name}: top=${topSku} ${matches[0]?.finalScore ?? 0}% embed=${embedMs}ms search=${searchMs}ms candidates=${result.dress_checker_debug?.inventoryImagesUsed}`,
    );
  }

  const acc = report.accuracy as {
    top1: number;
    top5: number;
    cases: number;
    false_positives: number;
    false_negatives: number;
  };
  acc.cases = ran;
  acc.top1 = ran ? Math.round((top1 / ran) * 100) : 0;
  acc.top5 = ran ? Math.round((top5 / ran) * 100) : 0;
  acc.false_positives = fp;
  acc.false_negatives = fn;

  const outPath = "scripts/benchmark-dress-checker-report.json";
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath}`);
  console.log(`Top-1: ${acc.top1}%  Top-5: ${acc.top5}%  Memory: ${Math.round(report.memory_mb as number)}MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
