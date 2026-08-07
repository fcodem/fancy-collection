import prisma from "@/lib/prisma";
import { getAiJobQueueStats } from "./aiJobClient";
import { getDurableWorkerHealth } from "./workerHeartbeat";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
} from "./profileReadiness";
import { decideAiIndexingBanner } from "./aiIndexingBanner";
import {
  countUnindexedInventoryWithPhotos,
  runAiIndexingSelfHealIfDue,
} from "./aiIndexingSelfHeal";

/** Match deploymentSafety lease window without importing that heavy module. */
const PROCESSING_LEASE_MS = 8 * 60 * 1000;

/**
 * Lightweight website/queue status. This module deliberately has no import
 * path to aiJobWorker/processInventory/transformers/onnxruntime.
 *
 * Website `ok` depends ONLY on the database. AI worker STALE/OFFLINE/DEGRADED
 * never marks the business website unhealthy.
 */
export async function getPublicHealthStatus(opts?: { selfHeal?: boolean }) {
  if (opts?.selfHeal !== false) {
    await runAiIndexingSelfHealIfDue().catch(() => undefined);
  }

  const queue = await getAiJobQueueStats().catch(() => null);

  let stuckProcessing = 0;
  try {
    stuckProcessing = await prisma.inventoryAiJob.count({
      where: {
        status: "PROCESSING",
        OR: [
          { lockedAt: { lt: new Date(Date.now() - PROCESSING_LEASE_MS) } },
          { startedAt: { lt: new Date(Date.now() - PROCESSING_LEASE_MS) } },
        ],
      },
    });
  } catch {
    stuckProcessing = 0;
  }

  const [dbOk, durable, profileRows, unindexedWithPhoto] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    getDurableWorkerHealth({
      failed: queue?.failed ?? 0,
      deadLetter: queue?.deadLetter ?? 0,
      stale: queue?.stale ?? 0,
      stuckProcessing,
    }),
    prisma
      .$queryRawUnsafe<Array<{ ai_status: string; count: number }>>(
        `SELECT COALESCE(NULLIF(ai_status,''), UPPER(status), 'PENDING') AS ai_status,
                COUNT(*)::int AS count
         FROM inventory_ai_profiles GROUP BY 1`,
      )
      .catch(() => [] as Array<{ ai_status: string; count: number }>),
    countUnindexedInventoryWithPhotos(),
  ]);

  const profiles: Record<string, number> = {};
  for (const row of profileRows) {
    profiles[String(row.ai_status).toUpperCase()] = Number(row.count) || 0;
  }

  const deadLetterCount = queue?.deadLetter ?? 0;
  const failedJobCount = (queue?.failed ?? 0) + deadLetterCount;
  const failedProfiles = profiles.FAILED ?? 0;
  const staleProfiles = profiles.STALE ?? 0;
  const pendingProfiles = profiles.PENDING ?? 0;
  const readyProfiles = profiles.READY ?? 0;

  const bannerDecision = decideAiIndexingBanner({
    dbOk,
    workerStatus: durable.status,
    failedJobCount,
    deadLetterCount,
    failedProfiles,
    staleProfiles,
    pendingProfiles,
    readyProfiles,
    queuePending: queue?.pending ?? 0,
    queueProcessing: queue?.processing ?? 0,
    queueRetrying: queue?.retrying ?? 0,
    unindexedWithPhoto,
    stuckProcessing,
  });

  // Optional AI degradation must never mark the business website unhealthy.
  const websiteOk = dbOk;
  const aiHealthy = bannerDecision.aiHealthy;
  const banner = bannerDecision.banner;
  const bannerLevel = bannerDecision.bannerLevel;

  return {
    ok: websiteOk,
    website: websiteOk ? "OK" : "DOWN",
    aiHealthy,
    deadLetterCount,
    lastSuccessfulJob: queue?.lastSuccessfulJobAt ?? durable.lastDrainAt ?? null,
    database: dbOk ? "OK" : "DOWN",
    queue: queue
      ? {
          status: queue.processing > 0 || queue.pending > 0 ? "ACTIVE" : "IDLE",
          pending: queue.pending,
          processing: queue.processing,
          failed: queue.failed,
          retrying: queue.retrying,
          stale: queue.stale,
          deadLetter: queue.deadLetter ?? 0,
          oldestPendingAgeMs: queue.oldestPendingAgeMs,
          oldestProcessingAgeMs: queue.oldestProcessingAgeMs,
          oldestPendingAt: queue.oldestPendingAt,
          oldestProcessingAt: queue.oldestProcessingAt,
          lastSuccessfulJobAt: queue.lastSuccessfulJobAt,
        }
      : {
          status: "UNKNOWN",
          pending: 0,
          processing: 0,
          failed: 0,
          retrying: 0,
          stale: 0,
          deadLetter: 0,
          oldestPendingAgeMs: null,
          oldestProcessingAgeMs: null,
          oldestPendingAt: null,
          oldestProcessingAt: null,
          lastSuccessfulJobAt: null,
        },
    ai: {
      status:
        durable.status === "HEALTHY" && failedProfiles === 0
          ? "HEALTHY"
          : durable.status === "DISABLED"
            ? "DISABLED"
            : "DEGRADED",
      READY: profiles.READY ?? 0,
      FAILED: profiles.FAILED ?? 0,
      STALE: profiles.STALE ?? 0,
      PROCESSING: profiles.PROCESSING ?? 0,
      RETRYING: profiles.RETRYING ?? 0,
    },
    worker: {
      status: durable.status,
      displayLabel: durable.displayLabel,
      mode: durable.mode,
      lastHeartbeatAt: durable.lastHeartbeatAt,
      lastDrainAt: durable.lastDrainAt,
      processedJobsToday: durable.processedJobsToday,
      heartbeatAgeMs: durable.heartbeatAgeMs,
      source: durable.source,
      expectedIntervalMs: durable.expectedIntervalMs,
      nextExpectedRunAt: durable.nextExpectedRunAt,
      reason: durable.reason,
    },
    failedJobCount,
    banner,
    bannerLevel,
    unindexedWithPhoto,
    readyProfiles,
    versions: {
      pipeline: CURRENT_PIPELINE_VERSION,
      matching: CURRENT_MATCHING_VERSION,
      recognition: CURRENT_RECOGNITION_VERSION,
    },
    generatedAt: new Date().toISOString(),
  };
}
