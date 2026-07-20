/**
 * Enterprise deployment safety — startup gates, audits, stuck-job recovery, watchdog.
 */
import prisma from "@/lib/prisma";
import { isPgvectorAvailable } from "@/lib/ai/pgvector";
import {
  AI_JOB_STATUS,
  enqueueInventoryAiJob,
  getAiJobQueueStats,
  markOutdatedProfilesStaleAndEnqueue,
  recoverExpiredProcessingLeases,
} from "./aiJobClient";
import {
  drainAiJobQueue,
  startAiJobWorker,
  touchAiWorkerHeartbeat,
} from "./aiJobWorker";
import { getDurableWorkerHealth } from "./workerHeartbeat";
import { runAiSystemHealthAudit, type AiSystemHealthReport } from "./aiSystemHealth";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
} from "./profileReadiness";

export const STUCK_JOB_THRESHOLD_MS = 8 * 60 * 1000;
export const WORKER_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export type EnvCheck = {
  name: string;
  present: boolean;
  critical: boolean;
};

export type DeploymentAuditReport = {
  generatedAt: string;
  environment: string;
  env: EnvCheck[];
  database: { ok: boolean; error?: string };
  extensions: { pgvector: "OK" | "MISSING" };
  tables: Record<string, "OK" | "MISSING">;
  indexes: { embeddingIndex: "OK" | "MISSING" | "UNKNOWN" };
  queue: Awaited<ReturnType<typeof getAiJobQueueStats>> & {
    stuckProcessing: number;
    pendingJobs: number;
    failedJobs: number;
  };
  worker: Awaited<ReturnType<typeof getDurableWorkerHealth>>;
  profiles: AiSystemHealthReport["profiles"];
  missingEmbeddings: number;
  missingSignatures: number;
  versionMismatches: number;
  ai: AiSystemHealthReport;
  criticalFailures: string[];
  warnings: string[];
  ok: boolean;
};

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    table,
  );
  return !!rows[0]?.exists;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column,
  );
  return !!rows[0]?.exists;
}

function checkEnv(): EnvCheck[] {
  const isProd = process.env.NODE_ENV === "production";
  return [
    { name: "DATABASE_URL", present: !!process.env.DATABASE_URL, critical: true },
    {
      name: "OPENAI_API_KEY",
      present: !!(process.env.OPENAI_API_KEY || process.env.DRESS_CHECKER_OPENAI_API_KEY),
      critical: isProd,
    },
    {
      name: "BLOB_READ_WRITE_TOKEN",
      present: !!process.env.BLOB_READ_WRITE_TOKEN,
      critical: isProd && process.env.VERCEL === "1",
    },
    { name: "SESSION_SECRET", present: !!process.env.SESSION_SECRET, critical: isProd },
    { name: "CRON_SECRET", present: !!process.env.CRON_SECRET, critical: false },
  ];
}

/** Recover jobs stuck in PROCESSING past the lease window. */
export async function recoverStuckAiJobs(): Promise<{ recovered: number; itemIds: number[] }> {
  const result = await recoverExpiredProcessingLeases(STUCK_JOB_THRESHOLD_MS);
  return { recovered: result.recovered, itemIds: result.itemIds };
}

/**
 * Queue watchdog: durable heartbeat + stuck recovery + drain.
 * Never uses in-memory worker flags for health decisions.
 */
export async function runQueueWatchdog(opts: { drainLimit?: number } = {}): Promise<{
  workerRestarted: boolean;
  stuckRecovered: number;
  drained: number;
  failedRequeued: number;
  warning?: string;
}> {
  const drainLimit = opts.drainLimit ?? 2;
  let stuckRecovered = 0;
  try {
    const stuck = await recoverStuckAiJobs();
    stuckRecovered = stuck.recovered;
  } catch (e) {
    console.warn("[deployment-safety] stuck-job recovery skipped:", e);
  }

  const durable = await getDurableWorkerHealth();
  let workerRestarted = false;
  let warning: string | undefined;
  if (durable.status === "OFFLINE" || durable.status === "STALE" || durable.status === "DEGRADED") {
    warning =
      durable.status === "OFFLINE"
        ? "Queue worker heartbeat offline — restarting drain"
        : durable.status === "STALE"
          ? "Queue worker heartbeat stale — draining now"
          : "Queue worker degraded — draining now";
    console.warn(`[deployment-safety] ${warning}`);
    // Drain only — never start setInterval from a Vercel request.
    workerRestarted = process.env.VERCEL !== "1";
    if (workerRestarted) {
      startAiJobWorker({ skipImmediateDrain: true });
    }
  }

  // Auto-requeue FAILED/STALE profiles so the degraded banner clears automatically
  let failedRequeued = 0;
  try {
    const failedProfiles = await prisma.inventoryAiProfile.findMany({
      where: { status: { in: ["FAILED", "STALE"] } },
      select: { itemId: true },
      take: 20,
    });
    if (failedProfiles.length > 0) {
      const ids = failedProfiles.map((p) => p.itemId);
      await prisma.inventoryAiProfile.updateMany({
        where: { itemId: { in: ids } },
        data: { status: "PENDING" },
      });
      // Reset existing failed jobs or create new pending ones
      await prisma.inventoryAiJob.updateMany({
        where: { itemId: { in: ids }, status: { in: ["FAILED", "DEAD_LETTER", "STALE"] } },
        data: { status: "PENDING", priority: 5, retryCount: 0, lastError: null, errorMessage: null },
      });
      failedRequeued = ids.length;
      console.log(`[watchdog] requeued ${failedRequeued} failed/stale AI profiles`);
    }
  } catch (e) {
    console.warn("[watchdog] failed profile requeue skipped:", e);
  }

  let drained = 0;
  if (drainLimit > 0) {
    try {
      const result = await drainAiJobQueue(drainLimit, { source: "watchdog" });
      drained = result.processed;
    } catch (e) {
      console.warn("[deployment-safety] drain skipped:", e);
    }
  } else {
    touchAiWorkerHeartbeat();
  }

  return {
    workerRestarted,
    stuckRecovered,
    drained,
    failedRequeued,
    warning,
  };
}

export async function runDeploymentAudit(): Promise<DeploymentAuditReport> {
  const env = checkEnv();
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  for (const e of env) {
    if (!e.present && e.critical) criticalFailures.push(`Missing env ${e.name}`);
    else if (!e.present) warnings.push(`Missing optional env ${e.name}`);
  }

  let database: DeploymentAuditReport["database"] = { ok: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true };
  } catch (e) {
    database = { ok: false, error: e instanceof Error ? e.message : "DB unreachable" };
    criticalFailures.push(`Database unreachable: ${database.error}`);
  }

  const requiredTables = [
    "clothing_items",
    "inventory_ai_profiles",
    "inventory_ai_jobs",
    "clothing_item_reference_photos",
  ];
  const tables: Record<string, "OK" | "MISSING"> = {};
  if (database.ok) {
    for (const t of requiredTables) {
      tables[t] = (await tableExists(t)) ? "OK" : "MISSING";
      if (tables[t] === "MISSING") criticalFailures.push(`Missing table ${t}`);
    }
    if (!(await columnExists("inventory_ai_profiles", "embedding_vector"))) {
      criticalFailures.push("Missing column inventory_ai_profiles.embedding_vector");
    }
    if (!(await columnExists("inventory_ai_profiles", "ai_status"))) {
      criticalFailures.push("Missing column inventory_ai_profiles.ai_status — run migrations");
    }
  }

  const pgvector = (await isPgvectorAvailable()) ? "OK" : "MISSING";
  if (pgvector === "MISSING") criticalFailures.push("pgvector extension missing");

  let embeddingIndex: "OK" | "MISSING" | "UNKNOWN" = "UNKNOWN";
  try {
    const idx = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'inventory_ai_profiles'
           AND indexdef ILIKE '%embedding_vector%'
       ) AS exists`,
    );
    embeddingIndex = idx[0]?.exists ? "OK" : "MISSING";
    if (embeddingIndex === "MISSING") warnings.push("embedding_vector index missing");
  } catch {
    embeddingIndex = "UNKNOWN";
  }

  const queueStats = await getAiJobQueueStats().catch(() => ({
    pending: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    retrying: 0,
    stale: 0,
    cancelled: 0,
    deadLetter: 0,
    workerId: "unavailable",
    oldestPendingAt: null,
    oldestPendingAgeMs: null,
    oldestProcessingAt: null,
    oldestProcessingAgeMs: null,
    lastSuccessfulJobAt: null,
    lastSuccessfulJobId: null,
  }));
  let stuckProcessing = 0;
  try {
    stuckProcessing = await prisma.inventoryAiJob.count({
      where: {
        status: AI_JOB_STATUS.PROCESSING,
        OR: [
          { lockedAt: { lt: new Date(Date.now() - STUCK_JOB_THRESHOLD_MS) } },
          { startedAt: { lt: new Date(Date.now() - STUCK_JOB_THRESHOLD_MS) } },
        ],
      },
    });
  } catch {
    warnings.push("Could not count stuck PROCESSING jobs (table may be missing)");
  }

  const durable = await getDurableWorkerHealth();
  if (durable.status === "OFFLINE") {
    const msg = `Queue worker offline (${durable.reason})`;
    if (process.env.NODE_ENV === "production") criticalFailures.push(msg);
    else warnings.push(msg);
  } else if (durable.status === "STALE") {
    warnings.push(`Worker heartbeat stale — ${durable.reason}`);
  } else if (durable.status === "DEGRADED") {
    warnings.push(`Worker degraded — ${durable.reason}`);
  } else if (durable.status === "DISABLED") {
    warnings.push("AI worker intentionally disabled");
  }

  const ai = await runAiSystemHealthAudit();
  if (ai.profiles.FAILED > 0) {
    warnings.push(`${ai.profiles.FAILED} FAILED AI profiles (will auto-retry via repair)`);
  }
  if (queueStats.failed > 0) {
    criticalFailures.push(`${queueStats.failed} FAILED queue jobs`);
  }
  if ((queueStats.deadLetter ?? 0) > 0) {
    criticalFailures.push(`${queueStats.deadLetter} DEAD_LETTER queue jobs`);
  }
  if (stuckProcessing > 0) {
    warnings.push(`${stuckProcessing} stuck PROCESSING jobs (>15m)`);
  }

  const missingEmbeddings = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (p.item_id IS NULL OR p.embedding_vector IS NULL OR COALESCE(p.has_embedding, false) = false)`,
  );
  const missingSignatures = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clothing_items c
     JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (
         p.embroidery_signature IS NULL
         OR p.border_signature IS NULL
         OR p.motif_signature IS NULL
         OR p.texture_signature IS NULL
         OR p.panel_signature IS NULL
         OR p.stone_signature IS NULL
         OR p.dominant_color IS NULL
       )`,
  );
  const versionMismatches = await prisma.inventoryAiProfile.count({
    where: {
      OR: [
        { matchingVersion: { lt: CURRENT_MATCHING_VERSION } },
        { recognitionVersion: { lt: CURRENT_RECOGNITION_VERSION } },
      ],
    },
  });

  const missEmb = missingEmbeddings[0]?.count ?? 0;
  const missSig = missingSignatures[0]?.count ?? 0;
  const pendingWork = queueStats.pending + queueStats.retrying + queueStats.processing;
  // Self-heal in progress: missing index data is OK while the queue still has work.
  if (missEmb > 0 && pendingWork === 0) {
    criticalFailures.push(`${missEmb} items missing embeddings (no pending jobs)`);
  } else if (missEmb > 0) {
    warnings.push(`${missEmb} items missing embeddings — ${pendingWork} jobs still queued`);
  }
  if (missSig > 0 && pendingWork === 0) {
    criticalFailures.push(`${missSig} items missing signatures (no pending jobs)`);
  } else if (missSig > 0) {
    warnings.push(`${missSig} items missing signatures — queue will continue`);
  }
  if (versionMismatches > 0) warnings.push(`${versionMismatches} version mismatches`);

  const report: DeploymentAuditReport = {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "unknown",
    env,
    database,
    extensions: { pgvector },
    tables,
    indexes: { embeddingIndex },
    queue: {
      ...queueStats,
      stuckProcessing,
      pendingJobs: queueStats.pending + queueStats.retrying,
      failedJobs: queueStats.failed,
    },
    worker: durable,
    profiles: ai.profiles,
    missingEmbeddings: missEmb,
    missingSignatures: missSig,
    versionMismatches,
    ai,
    criticalFailures,
    warnings,
    ok: criticalFailures.length === 0,
  };

  console.log(
    `[DEPLOYMENT AUDIT] ok=${report.ok} READY=${ai.profiles.READY} FAILED=${ai.profiles.FAILED} pendingJobs=${report.queue.pendingJobs} worker=${durable.displayLabel} pgvector=${pgvector}`,
  );
  if (criticalFailures.length) {
    console.error("[DEPLOYMENT AUDIT] critical:", criticalFailures.join("; "));
  }
  if (warnings.length) {
    console.warn("[DEPLOYMENT AUDIT] warnings:", warnings.join("; "));
  }

  return report;
}

/**
 * Startup gate: verify critical deps, start worker, recover stuck/pending work.
 * Throws in production when criticalFailures exist (unless AI_STARTUP_SOFT=1).
 */
export async function runStartupHealthCheck(): Promise<DeploymentAuditReport> {
  console.log("[startup] AI Dress Checker deployment safety check…");

  // Local long-lived processes may start the pump; Vercel relies on cron drains only.
  if (process.env.VERCEL !== "1") {
    startAiJobWorker();
  }

  try {
    await markOutdatedProfilesStaleAndEnqueue();
  } catch (e) {
    console.warn("[startup] version bump enqueue failed:", e);
  }

  const watchdog = await runQueueWatchdog();
  if (watchdog.warning) console.warn("[startup]", watchdog.warning);

  const report = await runDeploymentAudit();

  // Self-heal: continue pending jobs after interrupted deploy
  if (report.queue.pendingJobs > 0 || report.queue.retrying > 0) {
    const drained = await drainAiJobQueue(2);
    console.log(`[startup] drained ${drained.processed} pending AI jobs`);
  }

  const soft = process.env.AI_STARTUP_SOFT === "1" || process.env.NODE_ENV !== "production";
  if (!report.ok && !soft) {
    const msg = `AI Dress Checker startup failed: ${report.criticalFailures.join("; ")}`;
    console.error(`[startup] FATAL ${msg}`);
    throw new Error(msg);
  }
  if (!report.ok) {
    console.warn(
      `[startup] continuing with warnings (soft mode): ${report.criticalFailures.join("; ")}`,
    );
  } else {
    console.log("[startup] AI Dress Checker healthy");
  }

  return report;
}

