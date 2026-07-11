/**
 * Cross-view bridal forensic self-test.
 *
 * For each inventory item with multiple reference views, measures:
 * - TOP1 / TOP3 accuracy across catalog↔hanger/mannequin/skirt/customer
 * - false positives / false negatives
 *
 * Also includes the user-provided same-dress pair (mannequin ↔ lower-skirt handheld).
 *
 * Run: npx tsx scripts/forensic-cross-view-bridal.ts
 */
import { readFile, access, mkdir, writeFile, copyFile } from "fs/promises";
import { join, basename } from "path";
import { PrismaClient } from "@prisma/client";
import { searchInventoryByDressCheckerEnterprise } from "../src/lib/dressChecker/enterpriseSearch";
import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";
import { buildBridalIdentityHashes, detectBridalMotifs } from "../src/lib/dressChecker/bridalIdentityHashes";

const prisma = new PrismaClient();
const ASSET_ROOT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets";
const FIXTURE_DIR = join(process.cwd(), "test-fixtures", "cross-view");
const REPORT_PATH = join(process.cwd(), "test-fixtures", "cross-view-forensic-report.json");

const SAME_DRESS_PAIR = [
  {
    name: "lower_skirt_handheld",
    path: join(
      ASSET_ROOT,
      "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_1-6cbafb74-2f4b-4df8-b8c5-e869c2aa9449.png",
    ),
    expectedQueryType: "LOWER_SKIRT",
  },
  {
    name: "mannequin_full_Dn7967",
    path: join(
      ASSET_ROOT,
      "c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_2-d251ebf9-955d-4352-a37a-a3ba9c03b497.png",
    ),
    expectedQueryType: "MANNEQUIN",
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

type PairResult = {
  queryName: string;
  catalogName: string;
  queryType?: string;
  top1Sku: string | null;
  top1Score: number;
  top3Skus: string[];
  sameDressPairMatch: boolean;
  motifs: string[];
};

async function runPairSearch(queryPath: string, label: string): Promise<{
  top1Sku: string | null;
  top1Score: number;
  top3Skus: string[];
  queryType?: string;
  motifs: string[];
}> {
  const buf = await readFile(queryPath);
  const analysis = await analyzeQueryImage(buf);
  const motifs = detectBridalMotifs(analysis.fingerprint).map(
    (d) => `${d.kind}:${d.count}@${d.confidence}`,
  );
  const hashes = buildBridalIdentityHashes(analysis.fingerprint);
  console.log(
    `[forensic] ${label} queryType=${analysis.queryType} peacock=${hashes.peacockSignal} elephant=${hashes.elephantSignal} motifs=${motifs.join(",")}`,
  );

  const result = await searchInventoryByDressCheckerEnterprise(buf, {}, { limit: 10 });
  const top = result.results ?? [];
  return {
    top1Sku: top[0]?.sku ?? top[0]?.name ?? null,
    top1Score: top[0]?.similarity ?? 0,
    top3Skus: top.slice(0, 3).map((r) => r.sku || r.name || String(r.id)),
    queryType: analysis.queryType,
    motifs,
  };
}

async function evaluateInventoryCrossView() {
  const items = await prisma.clothingItem.findMany({
    where: { status: { not: "retired" } },
    take: 40,
    include: {
      referencePhotos: { orderBy: { sortOrder: "asc" }, take: 6 },
    },
  });

  let top1 = 0;
  let top3 = 0;
  let pairs = 0;
  let falsePos = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const item of items) {
    if (!item.photo || item.referencePhotos.length < 1) continue;
    const catalogPath = join(process.cwd(), "public", "uploads", item.photo);
    if (!(await exists(catalogPath))) continue;

    for (const ref of item.referencePhotos) {
      const refPath = join(process.cwd(), "public", "uploads", ref.photo);
      if (!(await exists(refPath))) continue;
      pairs += 1;
      try {
        const search = await searchInventoryByDressCheckerEnterprise(
          await readFile(refPath),
          {},
          { limit: 5 },
        );
        const ranks = (search.results ?? []).map((r) => r.id);
        const hit1 = ranks[0] === item.id;
        const hit3 = ranks.slice(0, 3).includes(item.id);
        if (hit1) top1 += 1;
        if (hit3) top3 += 1;
        if (!hit3 && (search.results?.[0]?.similarity ?? 0) >= 85) falsePos += 1;
        details.push({
          sku: item.sku,
          refLabel: ref.label,
          hit1,
          hit3,
          topIds: ranks.slice(0, 3),
        });
      } catch (err) {
        details.push({
          sku: item.sku,
          refLabel: ref.label,
          error: err instanceof Error ? err.message : "fail",
        });
      }
    }
  }

  return {
    pairs,
    top1Accuracy: pairs ? top1 / pairs : 0,
    top3Accuracy: pairs ? top3 / pairs : 0,
    falsePositives: falsePos,
    details,
  };
}

async function main() {
  await mkdir(FIXTURE_DIR, { recursive: true });

  const sameDressResults: PairResult[] = [];
  for (const q of SAME_DRESS_PAIR) {
    if (!(await exists(q.path))) {
      console.warn(`[forensic] missing fixture ${q.path}`);
      continue;
    }
    const dest = join(FIXTURE_DIR, `${q.name}.png`);
    await copyFile(q.path, dest);
    const search = await runPairSearch(q.path, q.name);
    sameDressResults.push({
      queryName: q.name,
      catalogName: "same_physical_lehenga",
      queryType: search.queryType,
      top1Sku: search.top1Sku,
      top1Score: search.top1Score,
      top3Skus: search.top3Skus,
      sameDressPairMatch: true,
      motifs: search.motifs,
    });
  }

  // Cross-search: lower skirt should retrieve same item as mannequin if indexed
  let crossViewPairOk = false;
  if (sameDressResults.length === 2) {
    const a = sameDressResults[0]!;
    const b = sameDressResults[1]!;
    crossViewPairOk =
      !!a.top1Sku &&
      !!b.top1Sku &&
      a.top1Sku === b.top1Sku &&
      a.top1Score >= 70 &&
      b.top1Score >= 70;
    console.log(
      `[forensic] SAME-DRESS PAIR cross-view: ${crossViewPairOk ? "PASS" : "CHECK"} ` +
        `skirt→${a.top1Sku}@${a.top1Score} mannequin→${b.top1Sku}@${b.top1Score}`,
    );
    console.log(
      "[forensic] GPT policy: auto-accept >92, verify 70–92, reject <70; forensic only on top 3 ambiguous",
    );
  }

  const inventory = await evaluateInventoryCrossView();

  // PHASE 11 — GPT accuracy from recent forensic audits (when GPT was called)
  let gptAccuracy: Record<string, unknown> = { note: "no recent GPT audits" };
  try {
    const audits = await prisma.$queryRawUnsafe<
      Array<{ gpt_called: boolean; gpt_skip_reason: string | null; final_score: number | null }>
    >(
      `SELECT gpt_called, gpt_skip_reason, final_score
       FROM dress_search_audits
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    const called = audits.filter((a) => a.gpt_called);
    const skipped = audits.filter((a) => !a.gpt_called);
    const autoAccept = skipped.filter((a) =>
      String(a.gpt_skip_reason || "").includes("auto") ||
      (a.final_score != null && a.final_score > 92),
    ).length;
    gptAccuracy = {
      recentAudits: audits.length,
      gptCalled: called.length,
      gptSkipped: skipped.length,
      gptCallRate: audits.length ? Number((called.length / audits.length).toFixed(3)) : 0,
      autoAcceptOrSkip: autoAccept,
      target: "GPT only on ambiguous 70–92 band",
    };
  } catch {
    gptAccuracy = { note: "dress_search_audits unavailable" };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sameDressUserPair: {
      note: "User confirmed both uploaded images are the SAME physical lehenga (mannequin ↔ lower skirt).",
      crossViewPairOk,
      results: sameDressResults,
    },
    inventoryCrossView: {
      pairs: inventory.pairs,
      top1Accuracy: Number(inventory.top1Accuracy.toFixed(3)),
      top3Accuracy: Number(inventory.top3Accuracy.toFixed(3)),
      falsePositives: inventory.falsePositives,
      falseNegatives: inventory.pairs - Math.round(inventory.top3Accuracy * inventory.pairs),
      crossViewAccuracy: Number(inventory.top1Accuracy.toFixed(3)),
    },
    gptAccuracy,
    targets: {
      crossViewAccuracy: "95%+",
      falsePositives: "<2%",
      falseNegatives: "<3%",
      openaiCalls: "ambiguous cases only (70–92)",
    },
    sampleDetails: inventory.details.slice(0, 30),
  };

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[forensic] report written ${REPORT_PATH}`);
  console.log(JSON.stringify(report.inventoryCrossView, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
