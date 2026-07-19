/**
 * Vercel/npm postinstall: Prisma schema requires DIRECT_URL even for `prisma generate`.
 * Derive it before generate so install does not fail when only DATABASE_URL is set.
 */
import { spawnSync } from "child_process";
import { ensureDirectUrl } from "./ensure-direct-url.mjs";

// `prisma generate` validates schema env() vars but does not connect.
// Local `npm install` may have no DB URLs yet — placeholders are enough for generate.
const ensured = ensureDirectUrl({ label: "prisma-postinstall", exitOnMissing: false });
if (ensured.source === "missing" || ensured.source === "invalid") {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL?.trim() ||
    "postgresql://prisma:prisma@127.0.0.1:5432/prisma?sslmode=disable";
  process.env.DIRECT_URL =
    process.env.DIRECT_URL?.trim() ||
    "postgresql://prisma:prisma@127.0.0.1:5432/prisma?sslmode=disable";
  console.log("[prisma-postinstall] using placeholder DB URLs for prisma generate only");
}

function run(label, command, args) {
  console.log(`[prisma-postinstall] ${label}…`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`[prisma-postinstall] ${label} failed with code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

run("prisma generate", "npx", ["prisma", "generate"]);
run("copy-assets", "node", ["scripts/copy-assets.mjs"]);
run("prune unused native platforms", "node", ["scripts/prune-native-packages.mjs"]);
console.log("[prisma-postinstall] done");
