/**
 * Single Vercel build entry: ensure DIRECT_URL, then generate → migrate → next build.
 * Derives Session-pooler DIRECT_URL (port 5432) from Transaction DATABASE_URL (6543)
 * when DIRECT_URL is not set — prevents 45-minute migrate hangs and missing-env fails.
 */
import { spawnSync } from "child_process";

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

function ensureDirectUrl() {
  if (process.env.DIRECT_URL?.trim()) {
    console.log("[vercel-build] DIRECT_URL is set");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("[vercel-build] DATABASE_URL is missing");
    process.exit(1);
  }
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    console.error(
      "[vercel-build] DATABASE_URL must start with postgresql:// — check Vercel env value (no quotes, no DATABASE_URL= prefix)",
    );
    process.exit(1);
  }
  process.env.DIRECT_URL = deriveDirectUrl(databaseUrl);
  console.log(
    "[vercel-build] derived DIRECT_URL from DATABASE_URL (Session pooler port 5432 for migrations)",
  );
}

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

ensureDirectUrl();

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
