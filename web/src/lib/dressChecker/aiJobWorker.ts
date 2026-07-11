/**
 * Background worker for durable InventoryAiJob queue.
 * In-process setInterval is only a local pump — NEVER used for health status.
 * Health = durable Postgres heartbeat (cron / drain / startup).
 */
import { processInventoryAiProfile } from "./processInventory";
import {
  claimNextAiJob,
  completeAiJob,
  failOrRetryAiJob,
  getAiJobQueueStats,
} from "./aiJobQueue";
import { touchDurableWorkerHeartbeat, getDurableWorkerHealth } from "./workerHeartbeat";

/** Local pump only — not a health signal. */
let workerTimer: ReturnType<typeof setInterval> | null = null;
let lastError: string | null = null;

export async function getAiWorkerHealthDurable() {
  return getDurableWorkerHealth();
}

export async function processOneAiJob(): Promise<boolean> {
  const job = await claimNextAiJob();
  if (!job) return false;

  console.log(`[ai-worker] PROCESSING job=${job.id} item=${job.itemId} reason=${job.reason}`);
  try {
    const ok = await processInventoryAiProfile(job.itemId, job.reason);
    if (ok) {
      await completeAiJob(job.id);
      console.log(`[ai-worker] READY job=${job.id} item=${job.itemId}`);
    } else {
      const outcome = await failOrRetryAiJob(job.id, "Indexing validation failed", {
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        itemId: job.itemId,
      });
      console.warn(`[ai-worker] ${outcome} job=${job.id} item=${job.itemId}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker job failed";
    lastError = message;
    const outcome = await failOrRetryAiJob(job.id, message, {
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      itemId: job.itemId,
    });
    console.error(`[ai-worker] ${outcome} job=${job.id} item=${job.itemId}:`, message);
  }
  return true;
}

/** Drain up to `limit` jobs (used by cron / admin Resume Queue). */
export async function drainAiJobQueue(
  limit = 5,
  opts: { source?: string } = {},
): Promise<{ processed: number }> {
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const did = await processOneAiJob();
    if (!did) break;
    processed++;
  }
  await touchDurableWorkerHeartbeat({
    source: opts.source || "drain",
    processedDelta: processed,
    error: lastError,
  });
  return { processed };
}

/**
 * Optional local pump for long-lived Node (npm run dress:worker / next start).
 * Does not affect health — only durable heartbeats do.
 */
export function startAiJobWorker(opts: { intervalMs?: number; skipImmediateDrain?: boolean } = {}): void {
  if (workerTimer) return;
  const intervalMs = opts.intervalMs ?? Number(process.env.AI_JOB_WORKER_INTERVAL_MS || 5000);
  console.log(`[ai-worker] local pump started interval=${intervalMs}ms`);

  void touchDurableWorkerHeartbeat({
    source: "process_start",
    processedDelta: 0,
    mode: "LOCAL_WORKER",
  });

  workerTimer = setInterval(() => {
    void (async () => {
      try {
        await drainAiJobQueue(2, { source: "process" });
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "tick failed";
        console.error("[ai-worker] tick error:", e);
        await touchDurableWorkerHeartbeat({
          source: "process",
          error: lastError,
          mode: "LOCAL_WORKER",
        });
      }
    })();
  }, intervalMs);

  if (!opts.skipImmediateDrain) {
    void drainAiJobQueue(1, { source: "process" });
  }
}

/** Heartbeat-only (deploy audit) — writes durable row, no RAM health. */
export function touchAiWorkerHeartbeat(): void {
  if (!workerTimer) startAiJobWorker({ skipImmediateDrain: true });
  void touchDurableWorkerHeartbeat({ source: "heartbeat" });
}

export function stopAiJobWorker(): void {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

export async function aiQueueHealthSnapshot() {
  const [queue, worker] = await Promise.all([getAiJobQueueStats(), getDurableWorkerHealth()]);
  return { queue, worker };
}
