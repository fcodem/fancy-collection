/**
 * npm run dress:audit — forensic report of dress-checker profile health.
 */
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
  assessInventoryProfile,
} from "../src/lib/dressChecker/profileReadiness";
import { isPgvectorAvailable } from "../src/lib/ai/pgvector";

const prisma = new PrismaClient();

async function main() {
  const pgOk = await isPgvectorAvailable();
  const profiles = await prisma.inventoryAiProfile.findMany({
    include: {
      item: { select: { id: true, sku: true, name: true, photo: true } },
    },
    orderBy: { itemId: "asc" },
  });

  const missingSignatures: Array<{ sku: string; reasons: string[] }> = [];
  const staleProfiles: Array<{ sku: string; aiStatus: string; versions: string }> = [];
  const versionMismatch: Array<{ sku: string; pipeline: string; recognition: number; matching: number }> = [];
  const failedJobs: Array<{ sku: string; reason: string | null }> = [];
  const colourInconsistencies: Array<{ sku: string; detail: string }> = [];
  const orphanEmbeddings: Array<{ sku: string }> = [];

  let ready = 0;
  let processing = 0;
  let pending = 0;
  let failed = 0;
  let stale = 0;

  for (const p of profiles) {
    const sku = p.item.sku;
    const status = p.aiStatus || p.status?.toUpperCase() || "PENDING";
    if (status === "READY") ready++;
    else if (status === "PROCESSING") processing++;
    else if (status === "PENDING") pending++;
    else if (status === "FAILED") failed++;
    else if (status === "STALE") stale++;

    if (status === "FAILED") {
      failedJobs.push({ sku, reason: p.indexFailureReason || p.error });
    }

    const pipe = Number(String(p.pipelineVersion || "0").replace(/\D/g, "") || 0);
    if (
      pipe < CURRENT_PIPELINE_VERSION ||
      (p.recognitionVersion ?? 0) < CURRENT_RECOGNITION_VERSION ||
      (p.matchingVersion ?? 0) < CURRENT_MATCHING_VERSION
    ) {
      versionMismatch.push({
        sku,
        pipeline: p.pipelineVersion,
        recognition: p.recognitionVersion,
        matching: p.matchingVersion,
      });
      staleProfiles.push({
        sku,
        aiStatus: status,
        versions: `pipe=${p.pipelineVersion} rec=${p.recognitionVersion} match=${p.matchingVersion}`,
      });
    }

    const assessment = await assessInventoryProfile(p.itemId);
    if (assessment && !assessment.ready) {
      missingSignatures.push({ sku, reasons: assessment.reasons });
    }

    if (p.dominantColor && assessment?.colourFamily === "unknown") {
      colourInconsistencies.push({ sku, detail: `dominant=${p.dominantColor} family=unknown` });
    }
    if (status === "READY" && assessment && !assessment.flags.hasColourData) {
      colourInconsistencies.push({ sku, detail: "READY but hasColourData=false" });
    }

    // Orphan: embedding present but not READY / missing signatures
    if (pgOk) {
      const emb = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
        `SELECT (embedding_vector IS NOT NULL) AS ok FROM inventory_ai_profiles WHERE item_id = $1`,
        p.itemId,
      );
      if (emb[0]?.ok && status !== "READY") {
        orphanEmbeddings.push({ sku });
      }
    }
  }

  // Duplicate reference image URLs across SKUs
  const refs = await prisma.clothingItemReferencePhoto.findMany({
    select: { photo: true, itemId: true, item: { select: { sku: true } } },
  });
  const byUrl = new Map<string, string[]>();
  for (const r of refs) {
    const list = byUrl.get(r.photo) ?? [];
    list.push(r.item.sku);
    byUrl.set(r.photo, list);
  }
  const duplicateReferenceImages = [...byUrl.entries()]
    .filter(([, skus]) => new Set(skus).size > 1)
    .map(([photo, skus]) => ({ photo, skus: [...new Set(skus)] }));

  const report = {
    generatedAt: new Date().toISOString(),
    currentVersions: {
      pipeline: CURRENT_PIPELINE_VERSION,
      recognition: CURRENT_RECOGNITION_VERSION,
      matching: CURRENT_MATCHING_VERSION,
    },
    pgvector: pgOk,
    counts: {
      total: profiles.length,
      ready,
      processing,
      pending,
      failed,
      stale,
      needsReindex: profiles.filter((p) => p.needsReindex).length,
    },
    missingSignatures: missingSignatures.slice(0, 200),
    staleProfiles: staleProfiles.slice(0, 200),
    versionMismatch: versionMismatch.slice(0, 200),
    orphanEmbeddings: orphanEmbeddings.slice(0, 200),
    duplicateReferenceImages,
    failedIndexingJobs: failedJobs.slice(0, 200),
    colourInconsistencies: colourInconsistencies.slice(0, 200),
    deployBlockers: {
      failedProfiles: failed,
      staleProfiles: stale,
      versionMismatches: versionMismatch.length,
      missingEmbeddings: missingSignatures.filter((m) =>
        m.reasons.some((r) => r.includes("embedding")),
      ).length,
      missingSignatures: missingSignatures.filter((m) =>
        m.reasons.some((r) => r.includes("signature")),
      ).length,
    },
  };

  const outDir = join(process.cwd(), "scripts");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, ".dress-audit-report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report.counts, null, 2));
  console.log("Deploy blockers:", JSON.stringify(report.deployBlockers, null, 2));
  console.log("Wrote", outPath);

  const blockers = report.deployBlockers;
  const hasBlockers =
    blockers.failedProfiles > 0 ||
    blockers.staleProfiles > 0 ||
    blockers.versionMismatches > 0 ||
    blockers.missingEmbeddings > 0 ||
    blockers.missingSignatures > 0;

  if (process.argv.includes("--strict") && hasBlockers) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
