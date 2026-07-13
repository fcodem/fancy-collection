/**
 * Vercel build: generate Prisma client → optional migrate → next build.
 * Migrate / owner-seed must NEVER fail the deploy (common Preview/pooler issues).
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
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

// --- Env bootstrap ---
log(`node=${process.version} vercel=${process.env.VERCEL || "0"} env=${process.env.VERCEL_ENV || "local"}`);

if (!process.env.DATABASE_URL?.trim()) {
  const placeholder = "postgresql://build:build@127.0.0.1:5432/build?sslmode=disable";
  process.env.DATABASE_URL = placeholder;
  process.env.DIRECT_URL = placeholder;
  console.warn(
    "[vercel-build] DATABASE_URL is missing in this Vercel environment. " +
      "Using a build placeholder so `prisma generate` + `next build` can finish. " +
      "Set DATABASE_URL (and DIRECT_URL) for Production AND Preview, then redeploy — " +
      "otherwise the live site cannot reach the database.",
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

// --- Prisma generate (required) ---
const prismaBin = bin("prisma");
run("prisma generate", prismaBin, ["generate"]);

// --- Migrate (optional — never fail deploy) ---
if (process.env.SKIP_PRISMA_MIGRATE === "1") {
  log("SKIP_PRISMA_MIGRATE=1 — skipping migrate deploy");
} else if (process.env.DATABASE_URL?.includes("127.0.0.1:5432/build")) {
  log("placeholder DATABASE_URL — skipping migrate deploy");
} else {
  const migrateTimeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 90_000);
  log(`prisma migrate deploy (timeout ${migrateTimeoutMs / 1000}s, non-blocking)…`);
  let migrate = runCapture(prismaBin, ["migrate", "deploy"], migrateTimeoutMs);
  let migrateOut = `${migrate.stdout || ""}\n${migrate.stderr || ""}`;
  if (migrate.stdout) process.stdout.write(migrate.stdout);
  if (migrate.stderr) process.stderr.write(migrate.stderr);

  if (migrate.error?.code === "ETIMEDOUT" || migrate.signal === "SIGTERM") {
    console.warn("[vercel-build] migrate timed out — continuing with next build");
  } else if ((migrate.status ?? 1) !== 0) {
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
      console.warn("[vercel-build] migrate still failing — continuing with next build");
    } else {
      log("migrate deploy OK after heal");
    }
  } else {
    log("migrate deploy OK");
  }
}

// --- Owner seed (optional) ---
if (!process.env.DATABASE_URL?.includes("127.0.0.1:5432/build")) {
  log("ensure owner account…");
  const seed = spawnSync(bin("tsx"), ["scripts/ensure-owner.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_RESET_OWNER: process.env.SEED_RESET_OWNER ?? "1",
    },
    shell: true,
    cwd: root,
    timeout: 45_000,
  });
  if ((seed.status ?? 1) !== 0) {
    console.warn(
      `[vercel-build] ensure-owner exited ${seed.status ?? 1} — use POST /api/setup/bootstrap-owner after deploy if needed`,
    );
  }
}

// --- Next build (required) ---
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
if (existsSync(nextBin)) {
  run("next build", process.execPath, [nextBin, "build"]);
} else {
  run("next build", bin("next"), ["build"]);
}

log("done");
