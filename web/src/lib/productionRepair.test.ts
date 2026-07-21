import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("Staff salary migration", () => {
  it("migration adds nullable monthly_salary and salary_date", () => {
    const mig = read("prisma/migrations/20260721140000_staff_salary_columns/migration.sql");
    assert.match(mig, /monthly_salary/);
    assert.match(mig, /salary_date/);
    assert.match(mig, /IF NOT EXISTS/i);
  });

  it("schema maps Staff salary fields", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /monthlySalary.*@map\("monthly_salary"\)/);
    assert.match(schema, /salaryDate.*@map\("salary_date"\)/);
  });
});

describe("Premium-only customer WhatsApp slips", () => {
  it("does not send jsPDF fallback to customers", () => {
    const automated = read("src/lib/services/whatsapp/automatedMessages.ts");
    assert.doesNotMatch(automated, /renderSlipWithFallback/);
    assert.doesNotMatch(automated, /generateBookingBillPdfFallback/);
    assert.doesNotMatch(automated, /generateOperationSlipPdfFallback/);
    assert.match(automated, /failPremiumSlipRender/);
    assert.match(automated, /Meta was not contacted/);
  });

  it("WhatsApp cron batch is bounded", () => {
    assert.match(read("src/app/api/cron/whatsapp-jobs/route.ts"), /maxJobs:\s*3/);
    assert.match(read("src/lib/services/whatsapp/jobQueue.ts"), /maxHeavyJobs|canStartWhatsAppJobWithBudget/);
  });

  it("Chromium launch retries up to 3 times", () => {
    assert.match(read("src/lib/services/whatsapp/pdfBrowserPool.ts"), /MAX_LAUNCH_ATTEMPTS = 3/);
  });
});

describe("Scanner and labels", () => {
  it("dress scanner enables Code 128 via qrOnly:false", () => {
    const scanner = read("src/components/DressAvailabilityScanner.tsx");
    assert.doesNotMatch(scanner, /qrOnly:\s*true/);
    assert.match(scanner, /qrOnly:\s*false/);
  });

  it("label-cell receives layout class", () => {
    assert.match(read("src/components/PrintCodesClient.tsx"), /label-cell\$\{layoutClass/);
  });
});

describe("AI and backup safety", () => {
  it("native AI disabled by default", () => {
    assert.match(read("src/lib/dressChecker/aiJobWorker.ts"), /defaultValue = false/);
  });

  it("repair cron drains one job", () => {
    assert.match(read("src/app/api/cron/dress-checker-repair/route.ts"), /drainAiJobQueue\(1/);
  });

  it("backup requires private backup token only", () => {
    const backup = read("src/app/api/cron/db-backup/route.ts");
    assert.match(backup, /BACKUP_BLOB_READ_WRITE_TOKEN/);
    assert.doesNotMatch(backup.replace(/BACKUP_BLOB_READ_WRITE_TOKEN/g, ""), /BLOB_READ_WRITE_TOKEN/);
  });
});
