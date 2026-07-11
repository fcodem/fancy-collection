import { touchDurableWorkerHeartbeat, getDurableWorkerHealth } from "../src/lib/dressChecker/workerHeartbeat";
import { buildQueueForensicReport } from "../src/lib/dressChecker/queueForensic";
import { drainAiJobQueue } from "../src/lib/dressChecker/aiJobWorker";

async function main() {
  await drainAiJobQueue(1, { source: "cron" });
  await touchDurableWorkerHeartbeat({ source: "cron", processedDelta: 0 });
  const worker = await getDurableWorkerHealth();
  const forensic = await buildQueueForensicReport();
  console.log(JSON.stringify({ worker, forensic }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
