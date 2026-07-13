/**
 * Single Vercel build entry: ensure DIRECT_URL, then generate → migrate → next build.
 * Auto-heals Prisma P3009 (failed migration recorded) by marking rolled-back and retrying once.
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

function runCapture(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
}

function extractFailedMigrationNames(text) {
  const names = new Set();
  const patterns = [
    /The `([^`]+)` migration[\s\S]*?failed/gi,
    /Migration name:\s*([^\s\r\n]+)/gi,
    /failed migrations? in the target database[\s\S]*?`([^`]+)`/gi,
    /migrate found failed migrations[\s\S]*?`([^`]+)`/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) names.add(m[1].trim());
    }
  }
  // Also catch bare folder-style names mentioned near P3009
  const p3009 = text.match(/P3009[\s\S]{0,800}/i);
  if (p3009) {
    for (const m of p3009[0].matchAll(/`?(20\d{12}_[A-Za-z0-9_]+)`?/g)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

function migrateDeployOnce() {
  const migrateTimeoutMs = Number(process.env.PRISMA_MIGRATE_TIMEOUT_MS || 120_000);
  console.log(`[vercel-build] prisma migrate deploy (timeout ${migrateTimeoutMs / 1000}s)…`);
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
    shell: true,
    timeout: migrateTimeoutMs,
  });
}

run("prisma generate", "npx", ["prisma", "generate"]);

let migrate = migrateDeployOnce();
const migrateOut = `${migrate.stdout || ""}\n${migrate.stderr || ""}`;
if (migrate.stdout) process.stdout.write(migrate.stdout);
if (migrate.stderr) process.stderr.write(migrate.stderr);

if (migrate.error?.code === "ETIMEDOUT" || migrate.signal === "SIGTERM") {
  console.error(
    "[vercel-build] migrate timed out. Set DIRECT_URL explicitly to Session pooler :5432",
  );
  process.exit(1);
}

if (migrate.status !== 0) {
  const failedNames = extractFailedMigrationNames(migrateOut);
  const looksLikeP3009 =
    /P3009|failed migrations in the target database|recorded as failed/i.test(migrateOut);

  if (looksLikeP3009) {
    const names =
      failedNames.length > 0
        ? failedNames
        : ["202607091345_pgvector_inventory_ai"]; // known production blocker

    console.warn(
      `[vercel-build] detected failed migration history (${names.join(", ")}). Marking rolled-back and retrying once…`,
    );

    for (const name of names) {
      const resolve = runCapture("npx", ["prisma", "migrate", "resolve", "--rolled-back", name]);
      if (resolve.stdout) process.stdout.write(resolve.stdout);
      if (resolve.stderr) process.stderr.write(resolve.stderr);
      if (resolve.status !== 0) {
        console.warn(`[vercel-build] resolve --rolled-back ${name} exited ${resolve.status}`);
      }
    }

    migrate = migrateDeployOnce();
    if (migrate.stdout) process.stdout.write(migrate.stdout);
    if (migrate.stderr) process.stderr.write(migrate.stderr);
  }
}

if (migrate.status !== 0) {
  console.error(`[vercel-build] migrate failed with code ${migrate.status ?? 1}`);
  process.exit(migrate.status ?? 1);
}

run("next build", "npx", ["next", "build"]);
console.log("[vercel-build] done");
