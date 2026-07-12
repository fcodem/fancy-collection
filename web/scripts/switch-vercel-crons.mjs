/**
 * Switch Vercel cron schedules between Hobby (daily) and Pro (frequent).
 *
 * Usage:
 *   node scripts/switch-vercel-crons.mjs hobby
 *   node scripts/switch-vercel-crons.mjs pro
 *
 * Hobby: vercel.json stays daily-only (required on free plan).
 * Pro:   copies vercel.pro.json → vercel.json (*/15, every minute, etc.).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = String(process.argv[2] || "").toLowerCase();

const hobbyPath = join(root, "vercel.hobby.json");
const proPath = join(root, "vercel.pro.json");
const activePath = join(root, "vercel.json");

const HOBBY_CRONS = [
  { path: "/api/cron/whatsapp-jobs", schedule: "0 9 * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/late-return-reminders", schedule: "0 10 * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/ai-job-worker", schedule: "0 11 * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/ai-queue-watchdog", schedule: "0 12 * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/dress-checker-repair", schedule: "0 13 * * *", timezone: "Asia/Kolkata" },
];

const PRO_CRONS = [
  { path: "/api/cron/whatsapp-jobs", schedule: "*/15 * * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/late-return-reminders", schedule: "0 10 * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/ai-job-worker", schedule: "* * * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/ai-queue-watchdog", schedule: "*/5 * * * *", timezone: "Asia/Kolkata" },
  { path: "/api/cron/dress-checker-repair", schedule: "0 */6 * * *", timezone: "Asia/Kolkata" },
];

function baseConfig() {
  if (existsSync(activePath)) {
    const cur = JSON.parse(readFileSync(activePath, "utf8"));
    const { crons: _drop, ...rest } = cur;
    return rest;
  }
  return {
    buildCommand: "npm run build:vercel",
    framework: "nextjs",
    regions: ["bom1"],
  };
}

function writePair(crons, label) {
  const cfg = { ...baseConfig(), crons };
  const json = `${JSON.stringify(cfg, null, 2)}\n`;
  writeFileSync(activePath, json);
  if (label === "hobby") writeFileSync(hobbyPath, json);
  if (label === "pro") writeFileSync(proPath, json);
  console.log(`Switched vercel.json to ${label.toUpperCase()} cron schedules.`);
  console.log("Redeploy on Vercel for the change to take effect.");
}

if (mode === "pro") {
  if (existsSync(proPath)) {
    copyFileSync(proPath, activePath);
    console.log("Copied vercel.pro.json → vercel.json (Pro frequent crons).");
    console.log("Redeploy on Vercel after upgrading to Pro.");
  } else {
    writePair(PRO_CRONS, "pro");
  }
} else if (mode === "hobby") {
  if (existsSync(hobbyPath)) {
    copyFileSync(hobbyPath, activePath);
    console.log("Copied vercel.hobby.json → vercel.json (Hobby daily crons).");
  } else {
    writePair(HOBBY_CRONS, "hobby");
  }
  console.log("Redeploy on Vercel for the change to take effect.");
} else {
  console.error("Usage: node scripts/switch-vercel-crons.mjs [hobby|pro]");
  process.exit(1);
}
