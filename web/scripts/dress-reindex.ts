/**
 * npm run dress:reindex -- --full
 * npm run dress:reindex -- --id=1049
 * npm run dress:repair
 *
 * Enqueues durable jobs then drains the worker (does not block HTTP path).
 */
import { PrismaClient } from "@prisma/client";
import { processInventoryAiProfile, rebuildAllAiProfiles } from "../src/lib/dressChecker/processInventory";
import { enqueueInventoryAiJob, enqueueRepairJobs } from "../src/lib/dressChecker/aiJobQueue";
import { drainAiJobQueue } from "../src/lib/dressChecker/aiJobWorker";

const prisma = new PrismaClient();

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  return "true";
}

async function main() {
  const isRepair =
    process.argv.some((a) => a.includes("dress-repair") || a === "--repair") ||
    process.env.npm_lifecycle_event === "dress:repair";
  const full = argValue("full") != null || process.argv.includes("--full");
  const idRaw = argValue("id");
  const sync = process.argv.includes("--sync");

  if (idRaw && idRaw !== "true") {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) throw new Error(`Invalid --id=${idRaw}`);
    if (sync) {
      console.log(`Sync reindexing item ${id}…`);
      const ok = await processInventoryAiProfile(id, "cli_reindex_sync");
      console.log(ok ? "READY" : "FAILED");
      process.exit(ok ? 0 : 1);
    }
    const job = await enqueueInventoryAiJob({
      itemId: id,
      reason: "cli_reindex",
      priority: 10,
      staleExisting: true,
    });
    console.log(`Enqueued job ${job.jobId} for item ${id}`);
    const drained = await drainAiJobQueue(5);
    console.log(JSON.stringify(drained));
    process.exit(0);
  }

  if (isRepair || process.argv.includes("--repair")) {
    const enqueued = await enqueueRepairJobs(500);
    console.log(`Enqueued ${enqueued} repair jobs`);
    const drained = await drainAiJobQueue(20);
    console.log(JSON.stringify({ enqueued, ...drained }));
    process.exit(0);
  }

  console.log(full ? "Enqueue full reindex…" : "Enqueue incomplete reindex…");
  const result = await rebuildAllAiProfiles(full);
  const drained = await drainAiJobQueue(20);
  console.log(JSON.stringify({ ...result, ...drained }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
