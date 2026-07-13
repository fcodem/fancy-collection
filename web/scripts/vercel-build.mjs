/**
 * Single Vercel build entry: ensure DIRECT_URL, then generate → migrate → next build.
 * Derives Session-pooler DIRECT_URL (port 5432) from Transaction DATABASE_URL (6543)
 * when DIRECT_URL is not set — prevents 45-minute migrate hangs and missing-env fails.
 */
import { spawnSync } from "child_process";
import { ensureDirectUrl } from "./ensure-direct-url.mjs";

ensureDirectUrl({ label: "vercel-build" });

function run(label, command, args) {
  console.log(`[vercel-build] ${label}…`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`[vercel-build] ${label} failed with code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

const migrateTimeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 120_000);
run("prisma generate", "npx", ["prisma", "generate"]);

console.log(`[vercel-build] prisma migrate deploy (timeout ${migrateTimeoutMs / 1000}s)…`);
const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
  timeout: migrateTimeoutMs,
});
if (migrate.error?.code === "ETIMEDOUT" || migrate.signal === "SIGTERM") {
  console.error(
    "[vercel-build] migrate timed out. Set DIRECT_URL explicitly to Session pooler :5432",
  );
  process.exit(1);
}
if (migrate.status !== 0) {
  console.error(`[vercel-build] migrate failed with code ${migrate.status ?? 1}`);
  process.exit(migrate.status ?? 1);
}

run("next build", "npx", ["next", "build"]);
console.log("[vercel-build] done");
