/**
 * Durable AI worker heartbeat — ONLY source of truth for worker health.
 * Never use in-memory setInterval / process flags for health status.
 *
 * Statuses (from workerHealthLogic):
 *   HEALTHY | DEGRADED | STALE | OFFLINE | DISABLED
 *
 * Thresholds are derived from the configured AI worker cron schedule
 * (default: vercel.json `/api/cron/ai-job-worker`), not a hard-coded "OK".
 */
import fs from "fs";
import path from "path";
import { hostname } from "os";
import prisma from "@/lib/prisma";
import {
  cronScheduleToIntervalMs,
  deriveWorkerHealth,
  type QueueHealthSignals,
  type WorkerMode,
  type WorkerStatus,
} from "./workerHealthLogic";

export type { WorkerMode, WorkerStatus } from "./workerHealthLogic";
export {
  cronScheduleToIntervalMs,
  deriveWorkerHealth,
  displayLabelFor,
  buildHeartbeatThresholds,
} from "./workerHealthLogic";

/** Local pump default (npm run dress:worker / next start). */
export const LOCAL_WORKER_INTERVAL_MS = 5_000;

export type DurableWorkerHealth = {
  status: WorkerStatus;
  /** True only when status === HEALTHY. Never means "online with stale heartbeat". */
  healthy: boolean;
  mode: WorkerMode;
  displayLabel: string;
  workerId: string | null;
  hostname: string | null;
  lastHeartbeatAt: string | null;
  lastDrainAt: string | null;
  processedJobs: number;
  processedJobsToday: number;
  heartbeatAgeMs: number | null;
  lastError: string | null;
  source: string | null;
  expectedIntervalMs: number;
  nextExpectedRunAt: string | null;
  reason: string;
};

const HOST = hostname();
const WORKER_ID = `${HOST}:${process.pid}`;

let cachedCronIntervalMs: number | null = null;

function resolveMode(source: string | null | undefined): WorkerMode {
  const s = (source || "").toLowerCase();
  if (
    s.includes("process") ||
    s.includes("local") ||
    s.includes("dress_worker") ||
    s === "process_start"
  ) {
    return "LOCAL_WORKER";
  }
  if (process.env.VERCEL === "1" || s.includes("serverless")) {
    return "SERVERLESS_WORKER";
  }
  if (
    s.includes("cron") ||
    s.includes("watchdog") ||
    s.includes("repair") ||
    s.includes("startup") ||
    s.includes("admin") ||
    s.includes("drain") ||
    s.includes("self_heal") ||
    s.includes("forensic")
  ) {
    return process.env.VERCEL === "1" ? "SERVERLESS_WORKER" : "CRON_WORKER";
  }
  return process.env.VERCEL === "1" ? "SERVERLESS_WORKER" : "CRON_WORKER";
}

/** Read `/api/cron/ai-job-worker` schedule from vercel.json (or env override). */
export function resolveAiWorkerExpectedIntervalMs(mode?: WorkerMode): number {
  const envOverride = Number(process.env.AI_WORKER_CRON_INTERVAL_MS || "");
  if (Number.isFinite(envOverride) && envOverride > 0) return envOverride;

  if (mode === "LOCAL_WORKER") {
    const local = Number(process.env.AI_JOB_WORKER_INTERVAL_MS || LOCAL_WORKER_INTERVAL_MS);
    return Number.isFinite(local) && local > 0 ? local : LOCAL_WORKER_INTERVAL_MS;
  }

  if (cachedCronIntervalMs != null) return cachedCronIntervalMs;

  const candidates = [
    path.join(process.cwd(), "vercel.json"),
    path.join(process.cwd(), "web", "vercel.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
        crons?: Array<{ path?: string; schedule?: string }>;
      };
      const worker = parsed.crons?.find((c) => c.path === "/api/cron/ai-job-worker");
      if (worker?.schedule) {
        const ms = cronScheduleToIntervalMs(worker.schedule);
        if (ms != null) {
          cachedCronIntervalMs = ms;
          return ms;
        }
      }
    } catch {
      /* ignore unreadable config */
    }
  }

  // Safe default matching current production vercel.json (*/15).
  cachedCronIntervalMs = 15 * 60_000;
  return cachedCronIntervalMs;
}

export function isAiWorkerDisabled(): boolean {
  const raw = (process.env.AI_WORKER_DISABLED || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function ensureHeartbeatTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_ai_worker_heartbeats (
      id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      worker_id           TEXT NOT NULL DEFAULT 'unknown',
      mode                TEXT NOT NULL DEFAULT 'CRON_WORKER',
      hostname            TEXT NOT NULL DEFAULT 'unknown',
      last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_drain_at       TIMESTAMPTZ,
      processed_jobs      INT NOT NULL DEFAULT 0,
      processed_jobs_today INT NOT NULL DEFAULT 0,
      processed_today_date DATE,
      last_error          TEXT,
      source              TEXT NOT NULL DEFAULT 'unknown',
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'CRON_WORKER'`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS hostname TEXT NOT NULL DEFAULT 'unknown'`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs INT NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs_today INT NOT NULL DEFAULT 0`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_today_date DATE`,
  );
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE inventory_ai_worker_heartbeats
      SET last_heartbeat_at = COALESCE(last_heartbeat_at, NOW())
      WHERE id = 1 AND last_heartbeat_at IS NULL
    `);
  } catch {
    /* ignore */
  }
  await prisma.$executeRawUnsafe(`
    INSERT INTO inventory_ai_worker_heartbeats (id, worker_id, mode, hostname, last_heartbeat_at, source)
    VALUES (1, 'bootstrap', 'CRON_WORKER', 'bootstrap', NOW(), 'ensure')
    ON CONFLICT (id) DO NOTHING
  `);
}

export async function touchDurableWorkerHeartbeat(opts: {
  source: string;
  processedDelta?: number;
  error?: string | null;
  mode?: WorkerMode;
}): Promise<void> {
  try {
    await ensureHeartbeatTable();
    const delta = Math.max(0, opts.processedDelta ?? 0);
    const mode = opts.mode || resolveMode(opts.source);
    const isDrain =
      delta > 0 ||
      ["cron", "watchdog", "drain", "startup", "process", "admin", "repair", "self_heal", "forensic_repair"].some(
        (s) => opts.source.toLowerCase().includes(s),
      );

    await prisma.$executeRawUnsafe(
      `UPDATE inventory_ai_worker_heartbeats SET
         worker_id = $1,
         mode = $2,
         hostname = $3,
         last_heartbeat_at = NOW(),
         last_drain_at = CASE WHEN $5::boolean THEN NOW() ELSE last_drain_at END,
         processed_jobs = COALESCE(processed_jobs, 0) + $4::int,
         processed_jobs_today = CASE
           WHEN processed_today_date = CURRENT_DATE THEN COALESCE(processed_jobs_today, 0) + $4::int
           ELSE $4::int
         END,
         processed_today_date = CURRENT_DATE,
         last_error = $6,
         source = $7,
         updated_at = NOW()
       WHERE id = 1`,
      WORKER_ID,
      mode,
      HOST,
      delta,
      isDrain,
      opts.error ?? null,
      opts.source,
    );
  } catch (e) {
    console.warn("[ai-worker] durable heartbeat write failed:", e);
  }
}

function offlineHealth(partial?: Partial<DurableWorkerHealth>): DurableWorkerHealth {
  const expectedIntervalMs = resolveAiWorkerExpectedIntervalMs();
  const derived = deriveWorkerHealth({
    heartbeatAt: null,
    expectedIntervalMs,
    disabled: isAiWorkerDisabled(),
  });
  return {
    status: derived.status,
    healthy: false,
    mode: "UNKNOWN",
    displayLabel: derived.displayLabel,
    workerId: null,
    hostname: null,
    lastHeartbeatAt: null,
    lastDrainAt: null,
    processedJobs: 0,
    processedJobsToday: 0,
    heartbeatAgeMs: null,
    lastError: null,
    source: null,
    expectedIntervalMs: derived.expectedIntervalMs,
    nextExpectedRunAt: null,
    reason: derived.reason,
    ...partial,
  };
}

/** Pure DB health — never consults process memory. */
export async function getDurableWorkerHealth(
  queueSignals?: QueueHealthSignals,
): Promise<DurableWorkerHealth> {
  try {
    if (isAiWorkerDisabled()) {
      return offlineHealth({
        status: "DISABLED",
        displayLabel: "DISABLED",
        reason: "AI_WORKER_DISABLED is set",
      });
    }

    await ensureHeartbeatTable();
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        worker_id: string;
        mode: string | null;
        hostname: string | null;
        last_heartbeat_at: Date | null;
        last_drain_at: Date | null;
        processed_jobs: number | null;
        processed_jobs_today: number | null;
        last_error: string | null;
        source: string | null;
      }>
    >(
      `SELECT worker_id, mode, hostname, last_heartbeat_at, last_drain_at,
              processed_jobs, processed_jobs_today, last_error, source
       FROM inventory_ai_worker_heartbeats WHERE id = 1`,
    );
    const row = rows[0];
    if (!row?.last_heartbeat_at) {
      return offlineHealth({ reason: "No durable heartbeat recorded" });
    }

    const mode = (row.mode as WorkerMode) || resolveMode(row.source);
    const expectedIntervalMs = resolveAiWorkerExpectedIntervalMs(mode);
    const derived = deriveWorkerHealth({
      heartbeatAt: row.last_heartbeat_at,
      mode,
      expectedIntervalMs,
      queue: queueSignals,
      lastError: row.last_error,
    });

    return {
      status: derived.status,
      healthy: derived.healthy,
      mode,
      displayLabel: derived.displayLabel,
      workerId: row.worker_id,
      hostname: row.hostname,
      lastHeartbeatAt: new Date(row.last_heartbeat_at).toISOString(),
      lastDrainAt: row.last_drain_at ? new Date(row.last_drain_at).toISOString() : null,
      processedJobs: Number(row.processed_jobs || 0),
      processedJobsToday: Number(row.processed_jobs_today || 0),
      heartbeatAgeMs: derived.heartbeatAgeMs,
      lastError: row.last_error,
      source: row.source,
      expectedIntervalMs: derived.expectedIntervalMs,
      nextExpectedRunAt: derived.nextExpectedRunAt,
      reason: derived.reason,
    };
  } catch (e) {
    console.warn("[ai-worker] durable heartbeat read failed:", e);
    return offlineHealth({
      lastError: e instanceof Error ? e.message : "heartbeat read failed",
      reason: "Heartbeat read failed",
    });
  }
}
