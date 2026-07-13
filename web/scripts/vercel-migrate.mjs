/**
 * Run prisma migrate deploy with a hard timeout so Vercel builds
 * fail fast instead of hanging 45 minutes on a Transaction pooler URL.
 */
import { spawn } from "child_process";

const timeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 120_000);

if (!process.env.DIRECT_URL?.trim()) {
  console.error(
    "[vercel-migrate] DIRECT_URL is missing.\n" +
      "Set DIRECT_URL to your Supabase Session pooler URI (port 5432).\n" +
      "Keep DATABASE_URL as Transaction pooler (port 6543) for the running app.",
  );
  process.exit(1);
}

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
