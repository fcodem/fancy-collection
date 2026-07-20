/**
 * Classify failed WhatsApp jobs with premium slip / Chromium render errors.
 *
 * Usage (from web/):
 *   npm run whatsapp:classify-failures
 *   npm run whatsapp:classify-failures -- --json
 */
import prisma from "../src/lib/prisma";
import { getWhatsAppRenderFailureReport } from "../src/lib/services/whatsapp/whatsappJobClassification";

const jsonOutput = process.argv.includes("--json");

async function main() {
  const report = await getWhatsAppRenderFailureReport(1000);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Failed render/infrastructure jobs: ${report.total}`);
    console.log(`Safe to requeue: ${report.safeToRequeue.length}`);
    console.log(`Withheld: ${report.withheld.length}`);
    console.log("By bucket:", report.byBucket);
    console.log("");

    for (const row of report.jobs.slice(0, 50)) {
      console.log(
        `#${row.jobId} ${row.jobType} [${row.bucket}] attempts=${row.attempts}/${row.maxAttempts}`,
      );
      console.log(`  reason: ${row.failedReason?.slice(0, 120) ?? "—"}`);
      console.log(
        `  meta=${row.metaMessageId ?? "none"} provider=${row.providerOutcome ?? "—"} sendStarted=${row.sendStartedAt ?? "no"} confirmed=${row.sendConfirmedAt ?? "no"}`,
      );
      console.log(
        `  failureBeforeProvider=${row.failureBeforeProvider} staleSendStarted=${row.staleSendStartedAt}`,
      );
      if (row.withholdReason) console.log(`  withhold: ${row.withholdReason}`);
      console.log("");
    }
    if (report.jobs.length > 50) {
      console.log(`...and ${report.jobs.length - 50} more. Use --json for full export.`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
