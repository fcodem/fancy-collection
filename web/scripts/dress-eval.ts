/**
 * Labeled Dress Checker evaluation harness.
 *
 * Usage:
 *   npx tsx scripts/dress-eval.ts
 *   npx tsx scripts/dress-eval.ts --case=onion
 *   npx tsx scripts/dress-eval.ts --no-openai
 *   npx tsx scripts/dress-eval.ts --with-openai
 *
 * Does not fabricate metrics when fixtures/images are missing.
 */
import { readFile, access, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prisma from "../src/lib/prisma";

type EvalCase = {
  id: string;
  queryImage?: string;
  queryItemId?: number;
  querySku?: string;
  expectedSku: string;
  relationship: "sameDress" | "sameCollection" | "differentDress";
  queryType?: string;
  category?: string;
  notes?: string;
};

type CaseResult = {
  id: string;
  status: "pass" | "fail" | "skip";
  reason?: string;
  top1Sku?: string | null;
  top3Skus?: string[];
  top1Score?: number;
  openaiCalled?: boolean;
  expectedSku: string;
  relationship: string;
};

const FIXTURE_PATH = join(process.cwd(), "test-fixtures", "dress-eval", "cases.json");
const OUT_DIR = join(process.cwd(), "test-fixtures", "dress-eval");

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function defaultCases(): Promise<EvalCase[]> {
  const items = await prisma.clothingItem.findMany({
    where: { sku: { in: ["ITM-1049", "ITM-1050", "ITM-1047"] } },
    select: { id: true, sku: true, photo: true, name: true },
  });
  const bySku = new Map(items.map((i) => [i.sku, i]));
  const cases: EvalCase[] = [];

  const onion2 = bySku.get("ITM-1050");
  const onion1 = bySku.get("ITM-1049");
  const rajwada = bySku.get("ITM-1047");

  if (onion2?.photo) {
    cases.push({
      id: "onion2-self",
      querySku: "ITM-1050",
      queryItemId: onion2.id,
      queryImage: join(process.cwd(), "public", "uploads", onion2.photo),
      expectedSku: "ITM-1050",
      relationship: "sameDress",
      queryType: "FULL_DRESS",
      notes: "Onion Bridal 2 catalog self-search must rank above sibling",
    });
  }
  if (onion1 && onion2?.photo) {
    cases.push({
      id: "onion-lookalike",
      querySku: "ITM-1050",
      queryItemId: onion2.id,
      queryImage: join(process.cwd(), "public", "uploads", onion2.photo),
      expectedSku: "ITM-1050",
      relationship: "sameCollection",
      notes: "Must distinguish ONION BRIDAL vs ONION BRIDAL 2",
    });
  }
  if (rajwada?.photo) {
    cases.push({
      id: "rajwada-self",
      querySku: "ITM-1047",
      queryItemId: rajwada.id,
      queryImage: join(process.cwd(), "public", "uploads", rajwada.photo),
      expectedSku: "ITM-1047",
      relationship: "sameDress",
      queryType: "MANNEQUIN",
      notes: "Multi Rajwada self / mannequin case",
    });
  }

  // Slots for missing fixtures (reported as skip, not fabricated)
  for (const slot of [
    "hanger-vs-mannequin",
    "folded-vs-open",
    "customer-vs-catalog",
    "partial-vs-full",
    "lowlight-vs-studio",
    "blurred",
    "screenshot",
  ]) {
    cases.push({
      id: `slot-${slot}`,
      expectedSku: "PENDING",
      relationship: "sameDress",
      notes: `Fixture slot reserved — add labeled image under test-fixtures/dress-eval/${slot}`,
    });
  }

  return cases;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    caseFilter: args.find((a) => a.startsWith("--case="))?.slice(7) || null,
    noOpenai: args.includes("--no-openai"),
    withOpenai: args.includes("--with-openai"),
  };
}

async function runCase(
  c: EvalCase,
  opts: { noOpenai: boolean },
): Promise<CaseResult> {
  if (!c.queryImage || c.expectedSku === "PENDING") {
    return {
      id: c.id,
      status: "skip",
      reason: c.notes || "missing fixture",
      expectedSku: c.expectedSku,
      relationship: c.relationship,
    };
  }
  if (!(await exists(c.queryImage))) {
    return {
      id: c.id,
      status: "skip",
      reason: `missing image ${c.queryImage}`,
      expectedSku: c.expectedSku,
      relationship: c.relationship,
    };
  }

  const prevVlm = process.env.DRESS_CHECKER_VLM;
  const prevEnabled = process.env.DRESS_CHECKER_OPENAI_ENABLED;
  if (opts.noOpenai) {
    process.env.DRESS_CHECKER_VLM = "0";
    process.env.DRESS_CHECKER_OPENAI_ENABLED = "0";
  }

  try {
    const { searchInventoryByDressCheckerEnterprise } = await import(
      "../src/lib/dressChecker/enterpriseSearch"
    );
    const buf = await readFile(c.queryImage);
    const result = await searchInventoryByDressCheckerEnterprise(buf, {}, { limit: 10, debug: true });
    const top = result.results ?? [];
    const top1Sku = top[0]?.sku ?? null;
    const top3 = top.slice(0, 3).map((r) => r.sku || "");
    const top1Score = top[0]?.similarity ?? 0;
    const openaiCalled = Boolean(
      (result.ai_diagnostics as { openai_verify?: unknown } | undefined)?.openai_verify,
    );

    let pass = false;
    if (c.relationship === "sameDress") {
      pass = top1Sku === c.expectedSku;
    } else if (c.relationship === "sameCollection") {
      // Correct SKU must beat sibling lookalike in top ranks
      pass = top1Sku === c.expectedSku;
    } else {
      pass = top1Sku !== c.expectedSku;
    }

    return {
      id: c.id,
      status: pass ? "pass" : "fail",
      reason: pass ? undefined : `top1=${top1Sku} expected=${c.expectedSku}`,
      top1Sku,
      top3Skus: top3,
      top1Score,
      openaiCalled,
      expectedSku: c.expectedSku,
      relationship: c.relationship,
    };
  } finally {
    if (prevVlm === undefined) delete process.env.DRESS_CHECKER_VLM;
    else process.env.DRESS_CHECKER_VLM = prevVlm;
    if (prevEnabled === undefined) delete process.env.DRESS_CHECKER_OPENAI_ENABLED;
    else process.env.DRESS_CHECKER_OPENAI_ENABLED = prevEnabled;
  }
}

async function main() {
  const opts = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });

  let cases: EvalCase[] = [];
  if (await exists(FIXTURE_PATH)) {
    cases = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as EvalCase[];
  } else {
    cases = await defaultCases();
    await writeFile(FIXTURE_PATH, JSON.stringify(cases, null, 2));
  }

  if (opts.caseFilter) {
    cases = cases.filter((c) => c.id.includes(opts.caseFilter!));
  }

  const noOpenai = opts.noOpenai || (!opts.withOpenai && process.env.DRESS_CHECKER_OPENAI_ENABLED === "0");
  const results: CaseResult[] = [];
  for (const c of cases) {
    console.log(`[eval] running ${c.id}…`);
    results.push(await runCase(c, { noOpenai }));
  }

  const runnable = results.filter((r) => r.status !== "skip");
  const passed = runnable.filter((r) => r.status === "pass").length;
  const failed = runnable.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const top1 = runnable.length
    ? runnable.filter((r) => r.top1Sku === r.expectedSku && r.relationship === "sameDress").length /
      Math.max(1, runnable.filter((r) => r.relationship === "sameDress").length)
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    openai: noOpenai ? "disabled" : "enabled",
    summary: {
      total: results.length,
      runnable: runnable.length,
      passed,
      failed,
      skipped,
      top1AccuracySameDress: top1,
      note: skipped
        ? "Skipped fixture slots are not fabricated into accuracy metrics."
        : undefined,
    },
    results,
  };

  const jsonPath = join(OUT_DIR, "report.json");
  const mdPath = join(OUT_DIR, "report.md");
  const htmlPath = join(OUT_DIR, "report.html");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  const md = [
    `# Dress Checker Eval`,
    ``,
    `Generated: ${report.generatedAt}`,
    `OpenAI: ${report.openai}`,
    ``,
    `## Summary`,
    `- Runnable: ${runnable.length}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Skipped (missing fixtures): ${skipped}`,
    `- Top1 (sameDress only): ${top1 == null ? "n/a" : (top1 * 100).toFixed(1) + "%"}`,
    ``,
    `## Cases`,
    ...results.map(
      (r) =>
        `- **${r.id}**: ${r.status}${r.reason ? ` — ${r.reason}` : ""} (top1=${r.top1Sku ?? "—"} score=${r.top1Score ?? "—"})`,
    ),
  ].join("\n");
  await writeFile(mdPath, md);
  await writeFile(
    htmlPath,
    `<!doctype html><html><body><pre>${md.replace(/</g, "&lt;")}</pre></body></html>`,
  );

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`[eval] wrote ${jsonPath}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
