/**
 * Run prisma migrate deploy with a hard timeout so Vercel builds
 * fail fast instead of hanging 45 minutes on a Transaction pooler URL.
 * If DIRECT_URL is unset, derive Session pooler (:5432) from DATABASE_URL.
 */
import { spawn } from "child_process";
import { ensureDirectUrl } from "./ensure-direct-url.mjs";

const timeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 120_000);

ensureDirectUrl({ label: "vercel-migrate" });

console.log(`[vercel-migrate] starting prisma migrate deploy (timeout ${timeoutMs / 1000}s)…`);

const child = spawn("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

const timer = setTimeout(() => {
  console.error(
    `[vercel-migrate] timed out after ${timeoutMs / 1000}s.\n` +
      "Migrate is likely stuck because DIRECT_URL still points at Transaction pooler (6543).\n" +
      "Use Session pooler host …pooler.supabase.com:5432 for DIRECT_URL.",
  );
  child.kill("SIGKILL");
  process.exit(1);
}, timeoutMs);

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
