/**
 * Standalone durable AI job worker process.
 * Usage: npm run dress:worker
 */
import { startAiJobWorker, drainAiJobQueue } from "../src/lib/dressChecker/aiJobWorker";
import { runAiSystemHealthAudit } from "../src/lib/dressChecker/aiSystemHealth";

async function main() {
  const report = await runAiSystemHealthAudit({ enqueueVersionBump: true });
  console.log(JSON.stringify({ ok: report.ok, profiles: report.profiles, blockers: report.blockers }, null, 2));

  startAiJobWorker({ intervalMs: Number(process.env.AI_JOB_WORKER_INTERVAL_MS || 3000) });
  await drainAiJobQueue(3);

  console.log("[dress:worker] running — Ctrl+C to stop");
  // Keep process alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
