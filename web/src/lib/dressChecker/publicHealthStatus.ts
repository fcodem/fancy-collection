import prisma from "@/lib/prisma";
import { getAiJobQueueStats } from "./aiJobQueue";
import { getDurableWorkerHealth } from "./workerHeartbeat";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
} from "./profileReadiness";

/**
 * Lightweight website/queue status. This module deliberately has no import
 * path to aiJobWorker/processInventory/transformers/onnxruntime.
 */
export async function getPublicHealthStatus() {
  const [dbOk, queue, durable, profileRows] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    getAiJobQueueStats().catch(() => null),
    getDurableWorkerHealth(),
    prisma
      .$queryRawUnsafe<Array<{ ai_status: string; count: number }>>(
        `SELECT COALESCE(NULLIF(ai_status,''), UPPER(status), 'PENDING') AS ai_status,
                COUNT(*)::int AS count
         FROM inventory_ai_profiles GROUP BY 1`,
      )
      .catch(() => [] as Array<{ ai_status: string; count: number }>),
  ]);

  const profiles: Record<string, number> = {};
  for (const row of profileRows) {
    profiles[String(row.ai_status).toUpperCase()] = Number(row.count) || 0;
  }

  const deadLetterCount = queue?.deadLetter ?? 0;
  const failedJobCount = (queue?.failed ?? 0) + deadLetterCount;
  const failedProfiles = profiles.FAILED ?? 0;

  // Optional AI degradation must never mark the business website unhealthy.
  const websiteOk = dbOk;
  const aiHealthy =
    dbOk && durable.status !== "OFFLINE" && failedJobCount === 0 && failedProfiles === 0;

  let banner: string | null = null;
  if (!dbOk) banner = "Database unreachable.";
  else if (durable.status === "OFFLINE") banner = "Queue worker offline (AI indexing paused).";
  else if (failedJobCount > 0 || failedProfiles > 0) {
    banner = "AI indexing degraded — inventory and bookings are unaffected.";
  }

  return {
    ok: websiteOk,
    website: websiteOk ? "OK" : "DOWN",
    aiHealthy,
    deadLetterCount,
    lastSuccessfulJob: durable.lastDrainAt ?? null,
    database: dbOk ? "OK" : "DOWN",
    queue: queue
      ? {
          status: queue.processing > 0 || queue.pending > 0 ? "ACTIVE" : "IDLE",
          pending: queue.pending,
          processing: queue.processing,
          failed: queue.failed,
          retrying: queue.retrying,
          deadLetter: queue.deadLetter ?? 0,
        }
      : { status: "UNKNOWN", pending: 0, processing: 0, failed: 0, retrying: 0, deadLetter: 0 },
    ai: {
      status: (profiles.FAILED ?? 0) > 0 ? "DEGRADED" : "OK",
      READY: profiles.READY ?? 0,
      FAILED: profiles.FAILED ?? 0,
      STALE: profiles.STALE ?? 0,
      PROCESSING: profiles.PROCESSING ?? 0,
      RETRYING: profiles.RETRYING ?? 0,
    },
    worker: {
      status: durable.status === "OFFLINE" ? "OFFLINE" : "OK",
      displayLabel: durable.displayLabel,
      mode: durable.mode,
      lastHeartbeatAt: durable.lastHeartbeatAt,
      lastDrainAt: durable.lastDrainAt,
      processedJobsToday: durable.processedJobsToday,
      heartbeatAgeMs: durable.heartbeatAgeMs,
      source: durable.source,
    },
    failedJobCount,
    banner,
    versions: {
      pipeline: CURRENT_PIPELINE_VERSION,
      matching: CURRENT_MATCHING_VERSION,
      recognition: CURRENT_RECOGNITION_VERSION,
    },
    generatedAt: new Date().toISOString(),
  };
}
