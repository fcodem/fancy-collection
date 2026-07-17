/**
 * Durable AI worker heartbeat — ONLY source of truth for worker health.
 * Never use in-memory setInterval / process flags for health status.
 */
import { hostname } from "os";
import prisma from "@/lib/prisma";

export const HEARTBEAT_HEALTHY_MS = 3 * 60 * 1000;
export const HEARTBEAT_DEGRADED_MS = 10 * 60 * 1000;

export type WorkerMode = "LOCAL_WORKER" | "CRON_WORKER" | "SERVERLESS_WORKER";

export type WorkerStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export type DurableWorkerHealth = {
  status: WorkerStatus;
  /** @deprecated use status === "HEALTHY" */
  healthy: boolean;
  mode: WorkerMode | "UNKNOWN";
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
};

const HOST = hostname();
const WORKER_ID = `${HOST}:${process.pid}`;

function resolveMode(source: string | null | undefined): WorkerMode {
  const s = (source || "").toLowerCase();
  if (s.includes("process") || s.includes("local") || s.includes("dress_worker") || s === "process_start") {
    return "LOCAL_WORKER";
  }
  if (process.env.VERCEL === "1" || s.includes("serverless")) {
    return "SERVERLESS_WORKER";
  }
  if (s.includes("cron") || s.includes("watchdog") || s.includes("repair") || s.includes("startup") || s.includes("admin") || s.includes("drain") || s.includes("self_heal") || s.includes("forensic")) {
    return process.env.VERCEL === "1" ? "SERVERLESS_WORKER" : "CRON_WORKER";
  }
  return process.env.VERCEL === "1" ? "SERVERLESS_WORKER" : "CRON_WORKER";
}

function modeDisplay(mode: WorkerMode | "UNKNOWN"): string {
  if (mode === "LOCAL_WORKER") return "local";
  if (mode === "SERVERLESS_WORKER") return "cron";
  if (mode === "CRON_WORKER") return "cron";
  return "unknown";
}

function statusFromAge(ageMs: number | null, mode: WorkerMode | "UNKNOWN"): WorkerStatus {
  if (ageMs == null || !Number.isFinite(ageMs)) return "OFFLINE";
  // Vercel cron workers only heartbeat when cron runs — allow a full day + buffer.
  const healthyMs =
    mode === "SERVERLESS_WORKER" || mode === "CRON_WORKER"
      ? 26 * 60 * 60 * 1000
      : HEARTBEAT_HEALTHY_MS;
  const degradedMs =
    mode === "SERVERLESS_WORKER" || mode === "CRON_WORKER"
      ? 30 * 60 * 60 * 1000
      : HEARTBEAT_DEGRADED_MS;
  if (ageMs < healthyMs) return "HEALTHY";
  if (ageMs < degradedMs) return "DEGRADED";
  return "OFFLINE";
}

function displayLabel(status: WorkerStatus, mode: WorkerMode | "UNKNOWN"): string {
  if (status === "OFFLINE") return "OFFLINE";
  const m = modeDisplay(mode);
  if (status === "DEGRADED") return `DEGRADED (${m})`;
  if (mode === "LOCAL_WORKER") return "ONLINE (local)";
  return "ONLINE (cron)";
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
  // Evolve older schema (idempotent)
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'CRON_WORKER'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS hostname TEXT NOT NULL DEFAULT 'unknown'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs INT NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_jobs_today INT NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`ALTER TABLE inventory_ai_worker_heartbeats ADD COLUMN IF NOT EXISTS processed_today_date DATE`);
  // Backfill from legacy columns if present
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

/** Pure DB health — never consults process memory. */
export async function getDurableWorkerHealth(): Promise<DurableWorkerHealth> {
  try {
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
      return {
        status: "OFFLINE",
        healthy: false,
        mode: "UNKNOWN",
        displayLabel: "OFFLINE",
        workerId: null,
        hostname: null,
        lastHeartbeatAt: null,
        lastDrainAt: null,
        processedJobs: 0,
        processedJobsToday: 0,
        heartbeatAgeMs: null,
        lastError: null,
        source: null,
      };
    }

    const lastMs = new Date(row.last_heartbeat_at).getTime();
    const ageMs = Date.now() - lastMs;
    const mode = (row.mode as WorkerMode) || resolveMode(row.source);
    const status = statusFromAge(ageMs, mode);

    return {
      status,
      healthy: status === "HEALTHY",
      mode,
      displayLabel: displayLabel(status, mode),
      workerId: row.worker_id,
      hostname: row.hostname,
      lastHeartbeatAt: new Date(row.last_heartbeat_at).toISOString(),
      lastDrainAt: row.last_drain_at ? new Date(row.last_drain_at).toISOString() : null,
      processedJobs: Number(row.processed_jobs || 0),
      processedJobsToday: Number(row.processed_jobs_today || 0),
      heartbeatAgeMs: ageMs,
      lastError: row.last_error,
      source: row.source,
    };
  } catch (e) {
    console.warn("[ai-worker] durable heartbeat read failed:", e);
    return {
      status: "OFFLINE",
      healthy: false,
      mode: "UNKNOWN",
      displayLabel: "OFFLINE",
      workerId: null,
      hostname: null,
      lastHeartbeatAt: null,
      lastDrainAt: null,
      processedJobs: 0,
      processedJobsToday: 0,
      heartbeatAgeMs: null,
      lastError: e instanceof Error ? e.message : "heartbeat read failed",
      source: null,
    };
  }
}
