/**
 * npm run deployment:audit
 * Full deployment safety audit — exits 1 on critical failures.
 * Self-heals first: enqueues repair jobs for incomplete/outdated profiles.
 * Does not run full AI indexing during the audit (avoids blocking deploy).
 */
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { runDeploymentAudit, runQueueWatchdog } from "../src/lib/dressChecker/deploymentSafety";
import { startAiJobWorker, stopAiJobWorker } from "../src/lib/dressChecker/aiJobWorker";
import {
  enqueueRepairJobs,
  markOutdatedProfilesStaleAndEnqueue,
} from "../src/lib/dressChecker/aiJobQueue";

async function main() {
  // Heartbeat-only worker — cron/runtime drains the queue after deploy.
  startAiJobWorker({ skipImmediateDrain: true, intervalMs: 60_000 });

  try {
    const repaired = await enqueueRepairJobs(500);
    const outdated = await markOutdatedProfilesStaleAndEnqueue();
    console.log(`[deployment:audit] self-heal enqueued repair=${repaired} outdated=${outdated}`);
  } catch (e) {
    console.warn("[deployment:audit] self-heal enqueue failed:", e);
  }

  await runQueueWatchdog({ drainLimit: 0 });
  const report = await runDeploymentAudit();

  const outDir = join(process.cwd(), "scripts");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, ".deployment-audit-report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== DEPLOYMENT AUDIT SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        database: report.database.ok,
        pgvector: report.extensions.pgvector,
        worker: report.worker.healthy,
        profiles: report.profiles,
        queue: {
          pending: report.queue.pendingJobs,
          failed: report.queue.failedJobs,
          stuck: report.queue.stuckProcessing,
        },
        missingEmbeddings: report.missingEmbeddings,
        missingSignatures: report.missingSignatures,
        versionMismatches: report.versionMismatches,
        criticalFailures: report.criticalFailures,
        warnings: report.warnings,
      },
      null,
      2,
    ),
  );
  console.log("Wrote", outPath);

  stopAiJobWorker();
  if (!report.ok) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  stopAiJobWorker();
  process.exit(1);
});
