/**
 * Pure AI-worker health rules (no I/O).
 *
 * Status model:
 *   HEALTHY   — heartbeat within 2 cron intervals (+ grace)
 *   DEGRADED  — heartbeat still fresh, but failures / stale / dead-letter exist
 *   STALE     — heartbeat older than 2 intervals
 *   OFFLINE   — heartbeat older than a larger threshold, or never seen
 *   DISABLED  — worker intentionally disabled
 */

export type WorkerStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "STALE"
  | "OFFLINE"
  | "DISABLED";

export type WorkerMode = "LOCAL_WORKER" | "CRON_WORKER" | "SERVERLESS_WORKER" | "UNKNOWN";

export type QueueHealthSignals = {
  failed?: number;
  deadLetter?: number;
  stale?: number;
  /** Processing jobs whose lease already expired. */
  stuckProcessing?: number;
};

export type HeartbeatThresholds = {
  /** Expected cron / local pump interval. */
  expectedIntervalMs: number;
  /** Extra grace on top of 2× interval before leaving HEALTHY/DEGRADED. */
  graceMs: number;
  /** Age above which STALE becomes OFFLINE. */
  offlineAfterMs: number;
};

export type DerivedWorkerHealth = {
  status: WorkerStatus;
  displayLabel: string;
  healthy: boolean;
  heartbeatAgeMs: number | null;
  expectedIntervalMs: number;
  healthyWithinMs: number;
  staleAfterMs: number;
  offlineAfterMs: number;
  nextExpectedRunAt: string | null;
  reason: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Parse a 5-field cron expression into the coarsest recurring interval in ms. */
export function cronScheduleToIntervalMs(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const step = (field: string, unitMs: number, max: number): number | null => {
    if (field === "*") return unitMs;
    const starStep = field.match(/^\*\/(\d+)$/);
    if (starStep) {
      const n = Number(starStep[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.min(n, max) * unitMs;
    }
    const rangeStep = field.match(/^\d+-\d+\/(\d+)$/);
    if (rangeStep) {
      const n = Number(rangeStep[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.min(n, max) * unitMs;
    }
    // Fixed value (e.g. "5", "0,15,30") — not a useful interval by itself.
    return null;
  };

  const minuteInterval = step(minute, MINUTE, 59);
  if (minuteInterval != null) return minuteInterval;

  const hourInterval = step(hour, HOUR, 23);
  if (hourInterval != null) {
    // "5 */2 * * *" → every 2 hours
    return hourInterval;
  }

  // Daily / weekly / monthly fixed schedules: treat as once per day.
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
    return 24 * HOUR;
  }
  if (/^\d+$/.test(hour) || hour.includes(",")) {
    return 24 * HOUR;
  }

  return null;
}

export function buildHeartbeatThresholds(expectedIntervalMs: number): HeartbeatThresholds {
  const interval = Math.max(MINUTE, expectedIntervalMs);
  // Grace: 25% of one interval, clamped to 1–5 minutes.
  const graceMs = Math.min(5 * MINUTE, Math.max(MINUTE, Math.round(interval * 0.25)));
  // Offline after 6 intervals, but never sooner than 2 hours for short crons,
  // and never later than 3 days for daily crons.
  const offlineAfterMs = Math.min(
    3 * 24 * HOUR,
    Math.max(2 * HOUR, interval * 6),
  );
  return { expectedIntervalMs: interval, graceMs, offlineAfterMs };
}

export function deriveWorkerHealth(input: {
  heartbeatAt: Date | string | null | undefined;
  now?: Date | number;
  mode?: WorkerMode;
  disabled?: boolean;
  expectedIntervalMs: number;
  queue?: QueueHealthSignals;
  lastError?: string | null;
}): DerivedWorkerHealth {
  const nowMs = typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime();
  const mode = input.mode ?? "UNKNOWN";
  const thresholds = buildHeartbeatThresholds(input.expectedIntervalMs);
  const healthyWithinMs = 2 * thresholds.expectedIntervalMs + thresholds.graceMs;
  const staleAfterMs = healthyWithinMs;
  const offlineAfterMs = thresholds.offlineAfterMs;

  if (input.disabled) {
    return {
      status: "DISABLED",
      displayLabel: "DISABLED",
      healthy: false,
      heartbeatAgeMs: null,
      expectedIntervalMs: thresholds.expectedIntervalMs,
      healthyWithinMs,
      staleAfterMs,
      offlineAfterMs,
      nextExpectedRunAt: null,
      reason: "Worker intentionally disabled",
    };
  }

  if (!input.heartbeatAt) {
    return {
      status: "OFFLINE",
      displayLabel: "OFFLINE",
      healthy: false,
      heartbeatAgeMs: null,
      expectedIntervalMs: thresholds.expectedIntervalMs,
      healthyWithinMs,
      staleAfterMs,
      offlineAfterMs,
      nextExpectedRunAt: null,
      reason: "No durable heartbeat recorded",
    };
  }

  const lastMs = new Date(input.heartbeatAt).getTime();
  const ageMs = Math.max(0, nowMs - lastMs);
  const nextExpectedRunAt = new Date(lastMs + thresholds.expectedIntervalMs).toISOString();

  let status: WorkerStatus;
  let reason: string;

  if (ageMs > offlineAfterMs) {
    status = "OFFLINE";
    reason = `Heartbeat age ${formatAgeShort(ageMs)} exceeds offline threshold ${formatAgeShort(offlineAfterMs)}`;
  } else if (ageMs > staleAfterMs) {
    status = "STALE";
    reason = `Heartbeat age ${formatAgeShort(ageMs)} exceeds 2 cron intervals (+ grace)`;
  } else {
    const q = input.queue ?? {};
    const hasProblems =
      (q.failed ?? 0) > 0 ||
      (q.deadLetter ?? 0) > 0 ||
      (q.stale ?? 0) > 0 ||
      (q.stuckProcessing ?? 0) > 0 ||
      Boolean(input.lastError);
    if (hasProblems) {
      status = "DEGRADED";
      reason = "Recent heartbeat, but queue has failures / stale / dead-letter / stuck jobs";
    } else {
      status = "HEALTHY";
      reason = `Heartbeat within ${formatAgeShort(healthyWithinMs)}`;
    }
  }

  return {
    status,
    displayLabel: displayLabelFor(status, mode),
    healthy: status === "HEALTHY",
    heartbeatAgeMs: ageMs,
    expectedIntervalMs: thresholds.expectedIntervalMs,
    healthyWithinMs,
    staleAfterMs,
    offlineAfterMs,
    nextExpectedRunAt,
    reason,
  };
}

export function displayLabelFor(status: WorkerStatus, mode: WorkerMode): string {
  if (status === "DISABLED" || status === "OFFLINE" || status === "STALE") {
    return status;
  }
  const modeLabel =
    mode === "LOCAL_WORKER" ? "local" : mode === "UNKNOWN" ? "unknown" : "cron";
  return `${status} (${modeLabel})`;
}

function formatAgeShort(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / 1000)}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  return `${(ms / HOUR).toFixed(1)}h`;
}
