/**
 * Self-healing AI queue orchestration — deployment-safe (cron + durable heartbeat).
 */
import {
  enqueueRepairJobs,
  markOutdatedProfilesStaleAndEnqueue,
  resumeFailedAiJobs,
  resumeDeadLetterAiJobs,
  getAiJobQueueStats,
} from "./aiJobQueue";
import { drainAiJobQueue, startAiJobWorker } from "./aiJobWorker";
import { recoverStuckAiJobs, runQueueWatchdog } from "./deploymentSafety";
import { touchDurableWorkerHeartbeat, getDurableWorkerHealth } from "./workerHeartbeat";

export type SelfHealReport = {
  stuckRecovered: number;
  repairEnqueued: number;
  outdatedEnqueued: number;
  failedResumed: number;
  deadLetterResumed: number;
  drained: number;
  worker: Awaited<ReturnType<typeof getDurableWorkerHealth>>;
  queue: Awaited<ReturnType<typeof getAiJobQueueStats>>;
};

/**
 * Full self-heal pass — safe to run on startup, cron, or admin "Repair All".
 * Does not require a long-lived process (Vercel-compatible).
 */
export async function runAiQueueSelfHeal(opts: {
  source?: string;
  drainLimit?: number;
  repairLimit?: number;
  resumeDeadLetters?: boolean;
} = {}): Promise<SelfHealReport> {
  const source = opts.source || "self_heal";
  const drainLimit = opts.drainLimit ?? 10;
  const repairLimit = opts.repairLimit ?? 200;

  startAiJobWorker({ skipImmediateDrain: true });

  const stuck = await recoverStuckAiJobs().catch(() => ({ recovered: 0 }));
  const repairEnqueued = await enqueueRepairJobs(repairLimit).catch(() => 0);
  const outdatedEnqueued = await markOutdatedProfilesStaleAndEnqueue().catch(() => 0);
  const failedResumed = await resumeFailedAiJobs().catch(() => 0);
  const deadLetterResumed = opts.resumeDeadLetters
    ? await resumeDeadLetterAiJobs().catch(() => 0)
    : 0;

  await runQueueWatchdog({ drainLimit: 0 }).catch(() => undefined);
  const drained = await drainAiJobQueue(drainLimit).catch(() => ({ processed: 0 }));

  await touchDurableWorkerHeartbeat({
    source,
    processedDelta: drained.processed,
  });

  const worker = await getDurableWorkerHealth();
  const queue = await getAiJobQueueStats().catch(() => ({
    pending: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    retrying: 0,
    stale: 0,
    cancelled: 0,
    deadLetter: 0,
    workerId: "unavailable",
  }));

  console.log(
    `[ai-self-heal] source=${source} stuck=${stuck.recovered} repair=${repairEnqueued} outdated=${outdatedEnqueued} failedResumed=${failedResumed} dlqResumed=${deadLetterResumed} drained=${drained.processed} worker=${worker.mode}`,
  );

  return {
    stuckRecovered: stuck.recovered,
    repairEnqueued,
    outdatedEnqueued,
    failedResumed,
    deadLetterResumed,
    drained: drained.processed,
    worker,
    queue,
  };
}
