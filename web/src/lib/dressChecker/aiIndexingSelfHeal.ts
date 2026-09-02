import prisma from "@/lib/prisma";
import { recoverExpiredProcessingLeases } from "@/lib/dressChecker/aiJobClient";
import { enqueueRepairJobs } from "@/lib/dressChecker/aiJobQueue";

let lastSelfHealAt = 0;
const SELF_HEAL_MIN_MS = 5 * 60_000;

export type AiIndexingSelfHealResult = {
  ran: boolean;
  recoveredLeases?: number;
  repairEnqueued?: number;
};

/** Rate-limited catch-up: recover stuck jobs and enqueue missing index work. */
export async function runAiIndexingSelfHealIfDue(
  force = false,
): Promise<AiIndexingSelfHealResult> {
  const now = Date.now();
  if (!force && now - lastSelfHealAt < SELF_HEAL_MIN_MS) {
    return { ran: false };
  }
  lastSelfHealAt = now;

  let recoveredLeases = 0;
  let repairEnqueued = 0;

  try {
    const recovered = await recoverExpiredProcessingLeases();
    recoveredLeases = recovered.recovered;
  } catch (e) {
    console.warn("[ai-self-heal] lease recovery skipped:", e);
  }

  try {
    repairEnqueued = await enqueueRepairJobs(100);
  } catch (e) {
    console.warn("[ai-self-heal] repair enqueue skipped:", e);
  }

  if (repairEnqueued > 0) {
    void kickAiIndexingDrain("self_heal_repair", 3);
  }

  return { ran: true, recoveredLeases, repairEnqueued };
}

/** After enqueueing repair work, kick the worker so indexing does not stall waiting for cron. */
export async function kickAiIndexingDrain(source: string, limit = 3): Promise<void> {
  try {
    const { drainAiJobQueue, resolveAiCronDrainLimit } = await import(
      "@/lib/dressChecker/aiJobWorker"
    );
    await drainAiJobQueue(resolveAiCronDrainLimit(limit), { source });
  } catch (e) {
    console.warn(`[ai-self-heal] drain kick skipped (${source}):`, e);
  }
}

export async function countUnindexedInventoryWithPhotos(): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count
       FROM clothing_items c
       LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
       WHERE c.photo IS NOT NULL AND TRIM(c.photo) <> ''
         AND (
           p.item_id IS NULL
           OR COALESCE(NULLIF(p.ai_status, ''), UPPER(p.status), 'PENDING') <> 'READY'
           OR COALESCE(p.needs_reindex, false) = true
         )`,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
