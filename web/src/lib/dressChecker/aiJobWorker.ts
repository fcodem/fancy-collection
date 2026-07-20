/**
 * Background worker for durable InventoryAiJob queue.
 * In-process setInterval is only a local pump — NEVER used for health status.
 * Health = durable Postgres heartbeat (cron / drain / startup).
 */
// NOTE: `./processInventory` (transformers/onnx/sharp) is intentionally NOT
// imported statically. It is dynamically imported inside processOneAiJob so the
// heavy model graph loads ONLY on the worker path, never when a normal route or
// the /api/health probe merely imports this module.
import {
  claimNextAiJob,
  completeAiJob,
  failOrRetryAiJob,
} from "./aiJobQueue";
import { getAiJobQueueStats } from "./aiJobClient";
import {
  AI_JOB_TIMEOUT_MS,
  isDeterministicFailure,
} from "./aiJobTypes";
import { formatTmpSpace, measureTmpSpace } from "@/lib/tmpSpace";
import { cleanSlipTempDirs } from "@/lib/slipTempCleanup";
import { touchDurableWorkerHeartbeat, getDurableWorkerHealth } from "./workerHeartbeat";

/** Skip native AI work when /tmp is nearly full (prevents SIGABRT / ENOSPC). */
const MIN_TMP_FREE_BYTES = 64 * 1024 * 1024;

function aiFeatureFlag(envVar: string, defaultValue = true): boolean {
  const raw = (process.env[envVar] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw !== "0" && raw !== "false" && raw !== "no";
}

export const AI_FLAGS = {
  get nativeColourEnabled() { return aiFeatureFlag("AI_LOCAL_COLOUR_ANALYSIS_ENABLED"); },
  get nativeEmbeddingEnabled() { return aiFeatureFlag("AI_NATIVE_EMBEDDING_ENABLED"); },
  get openaiEnrichmentEnabled() { return aiFeatureFlag("AI_OPENAI_ENRICHMENT_ENABLED"); },
} as const;

/** Local pump only — not a health signal. */
let workerTimer: ReturnType<typeof setInterval> | null = null;
let lastError: string | null = null;

async function ensureWorkerTmpHeadroom(): Promise<boolean> {
  try {
    await cleanSlipTempDirs();
  } catch {
    /* best-effort */
  }
  const snap = await measureTmpSpace();
  if (snap.freeBytes != null && snap.freeBytes < MIN_TMP_FREE_BYTES) {
    lastError = `Insufficient /tmp headroom (${formatTmpSpace(snap)})`;
    return false;
  }
  return true;
}

export async function getAiWorkerHealthDurable() {
  return getDurableWorkerHealth();
}

function withJobTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Job timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function processOneAiJob(): Promise<boolean> {
  if (!(await ensureWorkerTmpHeadroom())) {
    console.warn(`[ai-worker] skipped job claim: ${lastError}`);
    return false;
  }

  const job = await claimNextAiJob();
  if (!job) return false;

  const tmpBefore = await measureTmpSpace();
  console.log(
    `[ai-worker] PROCESSING job=${job.id} item=${job.itemId} reason=${job.reason} tmpBefore=${formatTmpSpace(tmpBefore)}`,
  );

  try {
    await withJobTimeout(runClaimedJob(job), AI_JOB_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker job failed";
    lastError = message;
    const fatalNative = isDeterministicFailure(message);
    const outcome = await failOrRetryAiJob(job.id, message, {
      retryCount: fatalNative ? job.maxRetries : job.retryCount,
      maxRetries: job.maxRetries,
      itemId: job.itemId,
    });
    console.error(`[ai-worker] ${outcome} job=${job.id} item=${job.itemId}:`, message);
  } finally {
    const tmpAfter = await measureTmpSpace();
    console.log(
      `[ai-worker] job=${job.id} tmpAfter=${formatTmpSpace(tmpAfter)}`,
    );
  }
  return true;
}

async function runClaimedJob(job: {
  id: number;
  itemId: number;
  reason: string;
  retryCount: number;
  maxRetries: number;
}): Promise<void> {
  const { default: prisma } = await import("@/lib/prisma");
  const { loadPhotoBuffer, PHOTO_SEARCH_MAX_BYTES } = await import("@/lib/services/siglipSearch");
  const item = await prisma.clothingItem.findUnique({
    where: { id: job.itemId },
    select: { photo: true, originalPhoto: true },
  });
  const path = item?.originalPhoto || item?.photo;
  if (path) {
    const buf = await loadPhotoBuffer(path);
    if (!buf) {
      const outcome = await failOrRetryAiJob(job.id, "Photo unavailable or exceeds size limit", {
        retryCount: job.maxRetries,
        maxRetries: job.maxRetries,
        itemId: job.itemId,
      });
      console.warn(
        `[ai-worker] ${outcome} job=${job.id} item=${job.itemId} (preflight size>${PHOTO_SEARCH_MAX_BYTES})`,
      );
      return;
    }
  }
  const { processInventoryAiProfile } = await import("./processInventory");
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
}

/** Drain up to `limit` jobs (used by cron / admin Resume Queue). */
export async function drainAiJobQueue(
  limit = 5,
  opts: { source?: string } = {},
): Promise<{ processed: number }> {
  try {
    await cleanSlipTempDirs();
  } catch {
    /* best-effort */
  }
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
 * NEVER start setInterval on Vercel — serverless crons must drain and exit.
 */
export function startAiJobWorker(opts: { intervalMs?: number; skipImmediateDrain?: boolean } = {}): void {
  if (process.env.VERCEL === "1") {
    console.warn(
      "[ai-worker] startAiJobWorker ignored on Vercel — use cron drainAiJobQueue instead",
    );
    return;
  }
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
        await drainAiJobQueue(1, { source: "process" });
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

/** Heartbeat-only (deploy audit) — writes durable row, no RAM health / no interval on Vercel. */
export function touchAiWorkerHeartbeat(): void {
  if (process.env.VERCEL !== "1" && !workerTimer) {
    startAiJobWorker({ skipImmediateDrain: true });
  }
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
