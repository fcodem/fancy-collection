/**
 * Startup / deployment AI system health audit.
 */
import prisma from "@/lib/prisma";
import { isPgvectorAvailable, getDressCheckerIndexStats } from "@/lib/ai/pgvector";
import {
  CURRENT_MATCHING_VERSION,
  CURRENT_PIPELINE_VERSION,
  CURRENT_RECOGNITION_VERSION,
} from "./profileReadiness";
import { getAiJobQueueStats } from "./aiJobQueue";
import { getDurableWorkerHealth } from "./workerHeartbeat";
import { markOutdatedProfilesStaleAndEnqueue } from "./aiJobQueue";

export type AiSystemHealthReport = {
  generatedAt: string;
  versions: {
    pipeline: number;
    matching: number;
    recognition: number;
  };
  profiles: {
    READY: number;
    PROCESSING: number;
    FAILED: number;
    STALE: number;
    RETRYING: number;
    PENDING: number;
  };
  queue: Awaited<ReturnType<typeof getAiJobQueueStats>>;
  worker: Awaited<ReturnType<typeof import("./workerHeartbeat").getDurableWorkerHealth>>;
  infrastructure: {
    pgvector: "OK" | "MISSING";
    embeddingColumn: "OK" | "MISSING";
    jobsTable: "OK" | "MISSING";
    heartbeatTable: "OK" | "MISSING";
    embeddingIndex: "OK" | "MISSING" | "UNKNOWN";
  };
  ok: boolean;
  blockers: string[];
};

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

export async function runAiSystemHealthAudit(opts: {
  enqueueVersionBump?: boolean;
} = {}): Promise<AiSystemHealthReport> {
  if (opts.enqueueVersionBump) {
    try {
      await markOutdatedProfilesStaleAndEnqueue();
    } catch (e) {
      console.warn("[ai-health] version bump enqueue failed:", e);
    }
  }

  const [pgvector, embCol, jobsTable, heartbeatTable, byStatus, queue, worker, stats] = await Promise.all([
    isPgvectorAvailable(),
    columnExists("inventory_ai_profiles", "embedding_vector"),
    tableExists("inventory_ai_jobs"),
    tableExists("inventory_ai_worker_heartbeats"),
    prisma
      .$queryRawUnsafe<Array<{ ai_status: string; count: number }>>(
        `SELECT COALESCE(NULLIF(ai_status, ''), UPPER(status), 'PENDING') AS ai_status,
                COUNT(*)::int AS count
         FROM inventory_ai_profiles
         GROUP BY 1`,
      )
      .catch(async () => {
        return prisma.$queryRawUnsafe<Array<{ ai_status: string; count: number }>>(
          `SELECT UPPER(COALESCE(status, 'pending')) AS ai_status, COUNT(*)::int AS count
           FROM inventory_ai_profiles
           GROUP BY 1`,
        );
      }),
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
    getDurableWorkerHealth(),
    getDressCheckerIndexStats().catch(() => ({
      totalProfiles: 0,
      withEmbedding: 0,
      withHash: 0,
      withColorHistogram: 0,
      withVerificationMetadata: 0,
      withReindexedAt: 0,
      ready: 0,
      failed: 0,
      processing: 0,
    })),
  ]);

  const profiles = {
    READY: 0,
    PROCESSING: 0,
    FAILED: 0,
    STALE: 0,
    RETRYING: 0,
    PENDING: 0,
  };
  for (const row of byStatus) {
    let key = String(row.ai_status || "PENDING").toUpperCase();
    if (key === "INDEXING") key = "PROCESSING";
    if (key in profiles) profiles[key as keyof typeof profiles] = Number(row.count) || 0;
  }

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
  } catch {
    embeddingIndex = "UNKNOWN";
  }

  const blockers: string[] = [];
  if (!pgvector) blockers.push("pgvector extension missing");
  if (!embCol) blockers.push("embedding_vector column missing");
  if (!jobsTable) blockers.push("inventory_ai_jobs table missing");
  if (!heartbeatTable) blockers.push("inventory_ai_worker_heartbeats table missing");
  if (profiles.FAILED > 0) blockers.push(`${profiles.FAILED} FAILED profiles`);
  if (profiles.STALE > 0) blockers.push(`${profiles.STALE} STALE profiles`);
  if (worker.status === "OFFLINE" && process.env.NODE_ENV === "production") {
    // Optional AI: empty queue + cron/serverless → do not block core rental health.
    const pending = Number((queue as { pending?: number }).pending ?? 0);
    const cronish =
      worker.mode === "SERVERLESS_WORKER" ||
      worker.mode === "CRON_WORKER" ||
      process.env.VERCEL === "1";
    if (!(cronish && pending === 0 && process.env.AI_WORKER_REQUIRED !== "1")) {
      blockers.push("AI job worker OFFLINE (no durable heartbeat within window)");
    }
  }

  const report: AiSystemHealthReport = {
    generatedAt: new Date().toISOString(),
    versions: {
      pipeline: CURRENT_PIPELINE_VERSION,
      matching: CURRENT_MATCHING_VERSION,
      recognition: CURRENT_RECOGNITION_VERSION,
    },
    profiles,
    queue,
    worker,
    infrastructure: {
      pgvector: pgvector ? "OK" : "MISSING",
      embeddingColumn: embCol ? "OK" : "MISSING",
      jobsTable: jobsTable ? "OK" : "MISSING",
      heartbeatTable: heartbeatTable ? "OK" : "MISSING",
      embeddingIndex,
    },
    ok: blockers.length === 0,
    blockers,
  };

  console.log(
    `[AI SYSTEM HEALTH] READY=${profiles.READY} PROCESSING=${profiles.PROCESSING} FAILED=${profiles.FAILED} STALE=${profiles.STALE} RETRYING=${profiles.RETRYING} | Queue Worker=${worker.displayLabel} mode=${worker.mode} pgvector=${report.infrastructure.pgvector} Embedding Index=${embeddingIndex} indexedVectors=${stats.withEmbedding}`,
  );

  return report;
}
