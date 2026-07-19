/**
 * Vercel build: generate Prisma client → migrate (required when DB configured) → next build.
 *
 * Preview/Production need real DATABASE_URL + DIRECT_URL (or Supabase POSTGRES_*).
 * Free-tier: same Supabase DB is OK for Preview — enable those vars for Preview in
 * Vercel (Production-only scope is why builds keep failing). Missing credentials or
 * failed migrate must fail the build so Preview cannot look healthy without schema.
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { applySupabaseEnvAliases } from "./apply-supabase-env.mjs";
import { ensureDirectUrl } from "./ensure-direct-url.mjs";

const root = process.cwd();

function log(msg) {
  console.log(`[vercel-build] ${msg}`);
}

function bin(name) {
  const local = join(root, "node_modules", ".bin", name);
  if (existsSync(local)) return local;
  const localCmd = `${local}.cmd`;
  if (existsSync(localCmd)) return localCmd;
  return name;
}

function run(label, command, args, { allowFail = false } = {}) {
  log(`${label}…`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
    cwd: root,
  });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`[vercel-build] ${label} failed with code ${code}`);
    if (!allowFail) process.exit(code);
    console.warn(`[vercel-build] continuing despite ${label} failure`);
  }
  return code;
}

function runCapture(command, args, timeoutMs) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    shell: true,
    cwd: root,
    timeout: timeoutMs,
  });
}

function extractFailedMigrationNames(text) {
  const names = new Set();
  const patterns = [
    /The `([^`]+)` migration[\s\S]*?failed/gi,
    /Migration name:\s*([^\s\r\n]+)/gi,
    /failed migrations? in the target database[\s\S]*?`([^`]+)`/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) names.add(m[1].trim());
    }
  }
  const p3009 = text.match(/P3009[\s\S]{0,800}/i);
  if (p3009) {
    for (const m of p3009[0].matchAll(/`?(20\d{12}_[A-Za-z0-9_]+)`?/g)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

function failMigrate(reason) {
  console.error(`[vercel-build] BLOCKED: ${reason}`);
  console.error(
    "[vercel-build] Set DATABASE_URL and DIRECT_URL for this Vercel environment " +
      "(Preview checkbox in Environment Variables — same free Supabase DB is fine). " +
      "Or rely on Supabase integration POSTGRES_URL / POSTGRES_PRISMA_URL for Preview. " +
      "Do not claim this deployment is testable until migrate deploy succeeds.",
  );
  process.exit(1);
}

// --- Env bootstrap ---
log(`node=${process.version} vercel=${process.env.VERCEL || "0"} env=${process.env.VERCEL_ENV || "local"}`);

// Supabase Vercel integration often sets POSTGRES_* only — map before the missing check.
applySupabaseEnvAliases({ label: "vercel-build" });

const isVercel = process.env.VERCEL === "1";
const vercelEnv = process.env.VERCEL_ENV || "";
const isDeployTarget = vercelEnv === "preview" || vercelEnv === "production";
const rawDatabaseUrl = process.env.DATABASE_URL?.trim() || "";
const isPlaceholderUrl =
  !rawDatabaseUrl || rawDatabaseUrl.includes("127.0.0.1:5432/build");

if (!rawDatabaseUrl) {
  const placeholder = "postgresql://build:build@127.0.0.1:5432/build?sslmode=disable";
  process.env.DATABASE_URL = placeholder;
  process.env.DIRECT_URL = process.env.DIRECT_URL || placeholder;
  console.warn(
    "[vercel-build] DATABASE_URL is missing (and no POSTGRES_* alias). " +
      "Using a local-only placeholder for prisma generate. " +
      "In Vercel → Environment Variables, enable DATABASE_URL + DIRECT_URL for Preview " +
      "(same Supabase project is OK on the free plan — check Preview, not only Production).",
  );
} else {
  // Rewrites db.*.supabase.co DIRECT_URL → Session pooler when DATABASE_URL is pooler.
  ensureDirectUrl({ label: "vercel-build", exitOnMissing: false });
}

log(`DATABASE_URL set=${Boolean(process.env.DATABASE_URL)} DIRECT_URL set=${Boolean(process.env.DIRECT_URL)}`);
if (process.env.DIRECT_URL && /@db\.[a-z0-9]+\.supabase\.co:/i.test(process.env.DIRECT_URL)) {
  console.warn(
    "[vercel-build] DIRECT_URL still points at db.*.supabase.co — expect P1001 on Vercel. " +
      "Set DIRECT_URL to Session pooler :5432 (same host as Transaction pooler, port 5432).",
  );
}

// On Vercel Preview/Production, missing DB credentials must not yield a "healthy" build
// without the required bookings.client_request_id migration.
if (isVercel && isDeployTarget && isPlaceholderUrl) {
  failMigrate(
    "DATABASE_URL is missing or is a build placeholder in this Vercel environment. " +
      "Required migration (booking client_request_id) cannot be applied.",
  );
}

// --- Prisma generate (required) ---
const prismaBin = bin("prisma");
run("prisma generate", prismaBin, ["generate"]);

// --- Migrate (required when a real database is configured) ---
if (process.env.SKIP_PRISMA_MIGRATE === "1") {
  if (isVercel && isDeployTarget && process.env.ALLOW_SKIP_MIGRATE !== "1") {
    failMigrate(
      "SKIP_PRISMA_MIGRATE=1 is not allowed on Preview/Production without ALLOW_SKIP_MIGRATE=1 " +
        "(idempotency schema must be applied).",
    );
  }
  log("SKIP_PRISMA_MIGRATE=1 — skipping migrate deploy");
} else if (isPlaceholderUrl) {
  if (isVercel && isDeployTarget) {
    failMigrate("placeholder DATABASE_URL — cannot migrate or verify idempotency schema");
  }
  log("placeholder DATABASE_URL — skipping migrate deploy (local/non-deploy only)");
} else {
  const migrateTimeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 90_000);
  log(`prisma migrate deploy (timeout ${migrateTimeoutMs / 1000}s, required)…`);
  let migrate = runCapture(prismaBin, ["migrate", "deploy"], migrateTimeoutMs);
  if (migrate.stdout) process.stdout.write(migrate.stdout);
  if (migrate.stderr) process.stderr.write(migrate.stderr);

  if (migrate.error?.code === "ETIMEDOUT" || migrate.signal === "SIGTERM") {
    failMigrate("prisma migrate deploy timed out — treating as deployment blocker");
  } else if ((migrate.status ?? 1) !== 0) {
    const migrateOut = `${migrate.stdout || ""}\n${migrate.stderr || ""}`;
    const looksLikeP3009 =
      /P3009|failed migrations in the target database|recorded as failed/i.test(migrateOut);
    if (looksLikeP3009) {
      const names = extractFailedMigrationNames(migrateOut);
      const list = names.length ? names : ["202607091345_pgvector_inventory_ai"];
      console.warn(`[vercel-build] healing failed migrations: ${list.join(", ")}`);
      for (const name of list) {
        const resolve = runCapture(prismaBin, ["migrate", "resolve", "--rolled-back", name], 60_000);
        if (resolve.stdout) process.stdout.write(resolve.stdout);
        if (resolve.stderr) process.stderr.write(resolve.stderr);
      }
      migrate = runCapture(prismaBin, ["migrate", "deploy"], migrateTimeoutMs);
      if (migrate.stdout) process.stdout.write(migrate.stdout);
      if (migrate.stderr) process.stderr.write(migrate.stderr);
    }
    if ((migrate.status ?? 1) !== 0) {
      failMigrate("prisma migrate deploy failed — deployment blocked until schema is applied");
    }
    log("migrate deploy OK after heal");
  } else {
    log("migrate deploy OK");
  }
}

// --- Quality gates (required before next build) ---
// On Vercel, `next build` already typechecks — skip duplicate tsc to shorten deploy.
if (process.env.VERCEL === "1") {
  log("typecheck skipped on Vercel (covered by next build)");
} else {
  run("typecheck", bin("tsc"), ["--noEmit"]);
}
run("lint", bin("next"), ["lint", "--quiet"]);
// Do not run the full test suite on Vercel: several *.integration.test.ts files
// and vitest-only suites need local fixtures / packages that are not in the deploy image.
if (process.env.VERCEL !== "1" && process.env.RUN_BUILD_TESTS === "1") {
  run("test", bin("npm"), ["run", "test:unit"], { allowFail: false });
}

// --- Owner seed: disabled on Vercel. Use in-app password change or scripts/set-owner-password.ts locally. ---
if (process.env.VERCEL !== "1" && process.env.OWNER_BOOTSTRAP_PASSWORD) {
  log("ensure owner account (local only)…");
  spawnSync(bin("tsx"), ["scripts/ensure-owner.ts"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
    cwd: root,
    timeout: 45_000,
  });
}

// --- Next build (required) ---
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
if (existsSync(nextBin)) {
  run("next build", process.execPath, [nextBin, "build"]);
} else {
  run("next build", bin("next"), ["build"]);
}

run("server bundle isolation report", process.execPath, [
  "scripts/analyze-server-bundles.mjs",
  "--assert-isolation",
]);

log("done");
