/**
 * Queue forensic metrics for admin dashboard + /api/admin/ai-indexing/forensic
 */
import prisma from "@/lib/prisma";
import { isPgvectorAvailable } from "@/lib/ai/pgvector";
import { getAiJobQueueStats, AI_JOB_STATUS } from "./aiJobClient";
import { getDurableWorkerHealth } from "./workerHeartbeat";

const STUCK_MS = 8 * 60 * 1000;
export type QueueForensicReport = {
  workerHealthy: boolean;
  workerStatus: string;
  workerDisplayLabel: string;
  workerMode: string;
  heartbeatAge: number | null;
  lastHeartbeatAt: string | null;
  lastQueueDrain: string | null;
  jobsProcessedToday: number;
  pendingJobs: number;
  processingJobs: number;
  retryJobs: number;
  failedJobs: number;
  deadLetters: number;
  stuckProcessing: number;
  oldestPendingJobAt: string | null;
  queueAgeSeconds: number | null;
  averageProcessingTimeMs: number | null;
  staleProfiles: number;
  profilesReady: number;
  deploymentSafe: boolean;
  queueSafe: boolean;
  searchSafe: boolean;
  warnings: string[];
  generatedAt: string;
};

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    name,
  );
  return !!rows[0]?.exists;
}

export async function buildQueueForensicReport(): Promise<QueueForensicReport> {
  const warnings: string[] = [];
  const [queue, pgvector, jobsTable, heartbeatTable, stuckProcessing, oldestPending, avgProc, profileCounts] =
    await Promise.all([
      getAiJobQueueStats().catch(() => ({
        pending: 0,
        processing: 0,
        ready: 0,
        failed: 0,
        retrying: 0,
        stale: 0,
        cancelled: 0,
        deadLetter: 0,
        workerId: "unavailable",
      })),
      isPgvectorAvailable(),
      tableExists("inventory_ai_jobs"),
      tableExists("inventory_ai_worker_heartbeats"),
      prisma.inventoryAiJob
        .count({
          where: {
            status: AI_JOB_STATUS.PROCESSING,
            OR: [
              { lockedAt: { lt: new Date(Date.now() - STUCK_MS) } },
              { startedAt: { lt: new Date(Date.now() - STUCK_MS) } },
            ],
          },
        })
        .catch(() => 0),
      prisma.inventoryAiJob
        .findFirst({
          where: { status: { in: [AI_JOB_STATUS.PENDING, AI_JOB_STATUS.RETRYING] } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
        .catch(() => null),
      prisma
        .$queryRawUnsafe<Array<{ avg_ms: number | null }>>(
          `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float AS avg_ms
           FROM inventory_ai_jobs
           WHERE status = 'READY'
             AND started_at IS NOT NULL
             AND completed_at IS NOT NULL
             AND completed_at > NOW() - INTERVAL '7 days'`,
        )
        .catch(() => [{ avg_ms: null }]),
      prisma
        .$queryRawUnsafe<Array<{ ai_status: string; count: number }>>(
          `SELECT COALESCE(NULLIF(ai_status,''), UPPER(status), 'PENDING') AS ai_status,
                  COUNT(*)::int AS count
           FROM inventory_ai_profiles GROUP BY 1`,
        )
        .catch(() => [] as Array<{ ai_status: string; count: number }>),
    ]);

  const worker = await getDurableWorkerHealth({
    failed: queue.failed,
    deadLetter: queue.deadLetter ?? 0,
    stale: queue.stale,
    stuckProcessing,
  });

  if (!pgvector) warnings.push("pgvector missing");
  if (!jobsTable) warnings.push("inventory_ai_jobs missing");
  if (!heartbeatTable) warnings.push("inventory_ai_worker_heartbeats missing");
  if (worker.status === "OFFLINE") warnings.push(`Worker heartbeat offline — ${worker.reason}`);
  else if (worker.status === "STALE") warnings.push(`Worker heartbeat stale — ${worker.reason}`);
  else if (worker.status === "DEGRADED") warnings.push(`Worker degraded — ${worker.reason}`);
  else if (worker.status === "DISABLED") warnings.push("Worker intentionally disabled");

  let profilesReady = 0;
  let staleProfiles = 0;
  for (const row of profileCounts) {
    const s = String(row.ai_status).toUpperCase();
    if (s === "READY") profilesReady = Number(row.count) || 0;
    if (s === "STALE") staleProfiles = Number(row.count) || 0;
  }

  const oldestPendingJobAt = oldestPending?.createdAt
    ? new Date(oldestPending.createdAt).toISOString()
    : null;
  const queueAgeSeconds = oldestPending?.createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(oldestPending.createdAt).getTime()) / 1000))
    : null;

  const deploymentSafe = pgvector && jobsTable && heartbeatTable;
  const queueSafe =
    queue.pending === 0 &&
    queue.failed === 0 &&
    (queue.deadLetter ?? 0) === 0 &&
    stuckProcessing === 0 &&
    worker.status !== "OFFLINE" &&
    worker.status !== "STALE";
  const searchSafe = profilesReady > 0 && pgvector && staleProfiles === 0;

  return {
    workerHealthy: worker.status === "HEALTHY",
    workerStatus: worker.status,
    workerDisplayLabel: worker.displayLabel,
    workerMode: worker.mode,
    heartbeatAge: worker.heartbeatAgeMs,
    lastHeartbeatAt: worker.lastHeartbeatAt,
    lastQueueDrain: worker.lastDrainAt,
    jobsProcessedToday: worker.processedJobsToday,
    pendingJobs: queue.pending,
    processingJobs: queue.processing,
    retryJobs: queue.retrying,
    failedJobs: queue.failed,
    deadLetters: queue.deadLetter ?? 0,
    stuckProcessing,
    oldestPendingJobAt,
    queueAgeSeconds,
    averageProcessingTimeMs: avgProc[0]?.avg_ms != null ? Math.round(avgProc[0].avg_ms) : null,
    staleProfiles,
    profilesReady,
    deploymentSafe,
    queueSafe,
    searchSafe,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
