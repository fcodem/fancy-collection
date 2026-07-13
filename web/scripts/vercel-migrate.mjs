/**
 * Run prisma migrate deploy with a hard timeout so Vercel builds
 * fail fast instead of hanging 45 minutes on a Transaction pooler URL.
 * If DIRECT_URL is unset, derive Session pooler (:5432) from DATABASE_URL.
 */
import { spawn } from "child_process";

const timeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 120_000);

function deriveDirectUrl(databaseUrl) {
  let direct = databaseUrl.replace(/:6543\b/g, ":5432");
  direct = direct
    .replace(/([?&])pgbouncer=true&?/gi, "$1")
    .replace(/([?&])connection_limit=\d+&?/gi, "$1")
    .replace(/\?&/g, "?")
    .replace(/[?&]$/g, "")
    .replace(/\?$/g, "");
  if (!/[?&]sslmode=/i.test(direct)) {
    direct += (direct.includes("?") ? "&" : "?") + "sslmode=require";
  }
  return direct;
}

if (!process.env.DIRECT_URL?.trim()) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("[vercel-migrate] DATABASE_URL and DIRECT_URL are both missing.");
    process.exit(1);
  }
  process.env.DIRECT_URL = deriveDirectUrl(databaseUrl);
  console.log(
    "[vercel-migrate] derived DIRECT_URL from DATABASE_URL (Session pooler port 5432)",
  );
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
