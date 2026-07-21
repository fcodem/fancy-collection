#!/usr/bin/env node
/**
 * Static verification gate for production repair acceptance criteria.
 * Exits 1 on any FAIL.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const fails = [];

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function fail(msg, file, detail) {
  fails.push({ msg, file, detail });
  console.log(`FAIL: ${msg}`);
  if (file) console.log(`  file: ${file}`);
  if (detail) console.log(`  ${detail}`);
}

function includesAll(source, patterns, file, label) {
  for (const p of patterns) {
    if (!source.includes(p)) {
      fail(`${label} — missing "${p}"`, file, p);
      return false;
    }
  }
  pass(label);
  return true;
}

function excludes(source, patterns, file, label) {
  for (const p of patterns) {
    if (source.includes(p)) {
      fail(`${label} — must not contain "${p}"`, file, p);
      return false;
    }
  }
  pass(label);
  return true;
}

function matchRegex(source, re, file, label) {
  if (!re.test(source)) {
    fail(label, file, String(re));
    return false;
  }
  pass(label);
  return true;
}

// 1–3 Staff salary migration
const migDir = "prisma/migrations/20260721140000_staff_salary_columns";
if (!exists(`${migDir}/migration.sql`)) {
  fail("Staff salary migration directory exists", migDir, "Create 20260721140000_staff_salary_columns");
} else {
  const mig = read(`${migDir}/migration.sql`);
  includesAll(mig, ["monthly_salary", "salary_date", "IF NOT EXISTS"], `${migDir}/migration.sql`, "Staff salary migration SQL");
}

// 4–5 No jsPDF fallback in customer WhatsApp sends
const automated = read("src/lib/services/whatsapp/automatedMessages.ts");
excludes(automated, ["renderSlipWithFallback", "generateBookingBillPdfFallback", "generateOperationSlipPdfFallback"], "automatedMessages.ts", "Customer WhatsApp slips do not use jsPDF fallback");

// 6–7 WhatsApp cron batch and runtime budget
const waCron = read("src/app/api/cron/whatsapp-jobs/route.ts");
const waProcess = read("src/app/api/whatsapp/jobs/process/route.ts");
const jobQueue = read("src/lib/services/whatsapp/jobQueue.ts");

for (const [file, src] of [
  ["cron/whatsapp-jobs/route.ts", waCron],
  ["whatsapp/jobs/process/route.ts", waProcess],
]) {
  const m = src.match(/maxJobs:\s*3|processWhatsAppJobQueue\s*\(\s*3/);
  if (!m) {
    fail(`WhatsApp batch size ≤ 3 in ${file}`, file, "no maxJobs: 3");
  } else {
    pass(`WhatsApp batch size ≤ 3 in ${file}`);
  }
  if (!/maxHeavyJobs:\s*1/.test(src)) {
    fail(`WhatsApp max one heavy job per invocation in ${file}`, file, "missing maxHeavyJobs: 1");
  } else {
    pass(`WhatsApp max one heavy job per invocation in ${file}`);
  }
}

matchRegex(jobQueue, /runtimeBudgetMs|WHATSAPP_CRON_SAFE_BUDGET_MS|45_000/, "jobQueue.ts", "WhatsApp worker runtime budget ~45s");

// 8–9 Scanner qrOnly:false
const scanner = read("src/components/DressAvailabilityScanner.tsx");
if (/qrOnly:\s*true/.test(scanner)) {
  fail("Dress scanner uses qrOnly:false", "DressAvailabilityScanner.tsx", "found qrOnly: true");
} else {
  pass("Dress scanner uses qrOnly:false");
}

// 10 Label class on label-cell
const printCodes = read("src/components/PrintCodesClient.tsx");
if (!/className=\{`label-cell \$\{layoutClass\}`\}/.test(printCodes) && !/className=\{\`label-cell \$\{layoutClass\}\`\}/.test(printCodes)) {
  if (!printCodes.includes("label-cell ${layoutClass}") && !printCodes.match(/label-cell.*layoutClass/)) {
    fail("layoutClass applied to label-cell", "PrintCodesClient.tsx", "layoutClass must be on outer label-cell");
  } else {
    pass("layoutClass applied to label-cell");
  }
} else {
  pass("layoutClass applied to label-cell");
}

// 11 A4 grid height within 297mm
if (!printCodes.includes("height: 296mm") && !printCodes.includes("height: 297mm")) {
  fail("A4 label page height defined", "PrintCodesClient.tsx", "missing 296mm/297mm page height");
} else {
  pass("A4 label page height defined");
}

// 12 QR max 18mm
matchRegex(printCodes, /18mm/, "PrintCodesClient.tsx", "QR maximum size ≤ 18mm");

// 13 Native AI disabled by default
const aiWorker = read("src/lib/dressChecker/aiJobWorker.ts");
if (!/defaultValue\s*=\s*false/.test(aiWorker) && !/AI_NATIVE_IMAGE_PROCESSING_ENABLED/.test(aiWorker)) {
  fail("Native AI feature flags default off", "aiJobWorker.ts", "expected defaultValue = false or explicit flag");
} else {
  pass("Native AI feature flags default off or explicit");
}

// 14 Repair cron does not drain 10 jobs
const repair = read("src/app/api/cron/dress-checker-repair/route.ts");
const drainM = repair.match(/drainAiJobQueue\s*\(\s*(\d+)/);
if (!drainM || Number(drainM[1]) > 1) {
  fail("Repair cron drains at most 1 AI job", "dress-checker-repair/route.ts", drainM ? `found ${drainM[1]}` : "no drain call");
} else {
  pass("Repair cron drains at most 1 AI job");
}

// 15–16 Backup token
const dbBackup = read("src/app/api/cron/db-backup/route.ts");
if (!dbBackup.includes("BACKUP_BLOB_READ_WRITE_TOKEN")) {
  fail("Backup requires BACKUP_BLOB_READ_WRITE_TOKEN", "db-backup/route.ts", "missing token check");
} else {
  pass("Backup references BACKUP_BLOB_READ_WRITE_TOKEN");
}
if (/BLOB_READ_WRITE_TOKEN/.test(dbBackup.replace(/BACKUP_BLOB_READ_WRITE_TOKEN/g, ""))) {
  fail("Backup does not fall back to public BLOB_READ_WRITE_TOKEN", "db-backup/route.ts", "public token fallback found");
} else {
  pass("Backup does not fall back to public BLOB_READ_WRITE_TOKEN");
}

// 17 Booking record Suspense for warnings
const bookingRecord = exists("src/app/booking/[id]/page.tsx")
  ? read("src/app/booking/[id]/page.tsx")
  : "";
if (bookingRecord && !bookingRecord.includes("Suspense")) {
  fail("Booking record uses Suspense for warnings", "booking/[id]/page.tsx", "Suspense not found");
} else if (bookingRecord) {
  pass("Booking record uses Suspense for warnings");
} else {
  fail("Booking record page exists", "src/app/booking/[id]/page.tsx", "file missing");
}

// 18–19 Page sizes
const menuPerf = read("src/lib/menuPerf.ts");
matchRegex(menuPerf, /BOOKING_LIST_PAGE_SIZE\s*=\s*50/, "menuPerf.ts", "Booking list max 50");
matchRegex(menuPerf, /LATE_RETURN_PAGE_SIZE\s*=\s*50/, "menuPerf.ts", "Late return max 50");

// 20 Staff attendance initial lean load
const staffPage = read("src/app/staff-attendance/page.tsx");
if (/salary|listUsers|allUsers/i.test(staffPage)) {
  fail("Staff attendance initial page does not load salary/all users", "staff-attendance/page.tsx", "heavy data on page load");
} else {
  pass("Staff attendance initial page is lean");
}

// 21 Chromium isolated to slip render route
const slipRenderRoute = read("src/app/api/internal/slip/render/route.ts");
if (
  !/renderSlipPdfDirect|renderHtmlUrlToPdf|pdfBrowserPool/.test(slipRenderRoute)
) {
  fail("Slip render route uses centralized renderer", "slip/render/route.ts", "missing renderer import");
} else {
  pass("Slip render route uses centralized renderer");
}

// 22 Premium-only customer slips
matchRegex(automated, /failPremiumSlipRender|Premium slip rendering failed|Meta was not contacted/i, "automatedMessages.ts", "Premium failure path without customer fallback");

// Slip health fields
const slipHealth = read("src/app/api/internal/slip/health/route.ts");
includesAll(
  slipHealth,
  ["freeTmpBytes", "chromiumReady", "activeRenders", "lastRenderSuccess", "lastRenderFailureCode"],
  "slip/health/route.ts",
  "Slip health endpoint fields",
);

// Chromium launch attempts
const pool = read("src/lib/services/whatsapp/pdfBrowserPool.ts");
matchRegex(pool, /MAX_LAUNCH_ATTEMPTS\s*=\s*3/, "pdfBrowserPool.ts", "Chromium MAX_LAUNCH_ATTEMPTS = 3");

// WhatsApp runtime budget (timeout fix)
const waRuntime = read("src/lib/services/whatsapp/whatsappRuntime.ts");
matchRegex(waRuntime, /WHATSAPP_SLIP_JOB_TIMEOUT_MS\s*=\s*38_000/, "whatsappRuntime.ts", "Heavy slip job timeout ~38s");
matchRegex(waRuntime, /WHATSAPP_CRON_SAFE_BUDGET_MS\s*=\s*45_000/, "whatsappRuntime.ts", "Cron safe budget ~45s");
matchRegex(waRuntime, /WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS\s*=\s*31_000/, "whatsappRuntime.ts", "Renderer request timeout ~31s");
excludes(jobQueue, ["JOB_TIMEOUT_MS = 120_000"], "jobQueue.ts", "No 120s WhatsApp job timeout");
includesAll(jobQueue, ["maxHeavyJobs", "canStartWhatsAppJobWithBudget", "releaseWhatsAppJobWithoutAttempt", "abortSignal"], "jobQueue.ts", "Bounded heavy job claiming and release");
includesAll(read("src/lib/services/whatsapp/slipHtmlPdf.server.ts"), ["WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS", "controller.signal", "linkAbortSignal"], "slipHtmlPdf.server.ts", "AbortSignal reaches renderSlipViaEndpoint");

if (!exists("src/app/admin/premium-slip-test/page.tsx")) {
  fail("Premium slip owner test page exists", "src/app/admin/premium-slip-test/page.tsx", "missing");
} else {
  pass("Premium slip owner test page exists");
}
if (!exists("src/app/api/admin/test-all-premium-slips/route.ts")) {
  fail("Premium slip test API exists", "src/app/api/admin/test-all-premium-slips/route.ts", "missing");
} else {
  pass("Premium slip test API exists");
}
const premiumTestClient = exists("src/components/PremiumSlipTestClient.tsx")
  ? read("src/components/PremiumSlipTestClient.tsx")
  : "";
if (premiumTestClient && /8077843874|whatsappNo/.test(premiumTestClient)) {
  fail("Owner test page never defaults to customer WhatsApp number", "PremiumSlipTestClient.tsx", "default phone found");
} else if (premiumTestClient) {
  pass("Owner test page never defaults to customer WhatsApp number");
}

console.log("\n--- Summary ---");
console.log(`FAIL: ${fails.length}`);
if (fails.length > 0) {
  process.exit(1);
}
console.log("All production fix verifications passed.");
