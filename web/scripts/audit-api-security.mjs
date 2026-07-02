/**
 * API security audit — lists auth coverage per route.
 * Usage: node scripts/audit-api-security.mjs
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name === "route.ts") files.push(p);
  }
  return files;
}

function isIntentionalPublic(rel) {
  if (rel === "login/route.ts" || rel === "logout/route.ts" || rel === "session/check/route.ts") return true;
  if (rel.startsWith("login-request/")) return true;
  if (rel.startsWith("cron/")) return true;
  if (rel === "whatsapp/webhook/route.ts") return true;
  return false;
}

function classify(file) {
  const rel = file.replace(apiDir, "").replace(/\\/g, "/").replace(/^\//, "");
  const src = readFileSync(file, "utf8");
  const intentional = isIntentionalPublic(rel);
  const hasUser = /requireUser|requireUserReadOnly|getCurrentUser/.test(src);
  const hasOwner = /requireOwner/.test(src);
  const hasCron = /CRON_SECRET/.test(src);
  const hasWebhookVerify = /hub\.verify_token|WHATSAPP_WEBHOOK_VERIFY_TOKEN/.test(src);
  const isDebug = rel.includes("api/debug/");

  let status = "protected";
  if (intentional) status = "public-intentional";
  else if (isDebug && hasOwner) status = "owner-only";
  else if (!hasUser && !hasOwner && !hasCron && !hasWebhookVerify) status = "MISSING_AUTH";

  return { rel, status, hasUser, hasOwner, hasCron, isDebug };
}

const rows = walk(apiDir).map(classify).sort((a, b) => a.rel.localeCompare(b.rel));
const missing = rows.filter((r) => r.status === "MISSING_AUTH");
const publicRoutes = rows.filter((r) => r.status === "public-intentional");
const ownerRoutes = rows.filter((r) => r.hasOwner);
const protectedRoutes = rows.filter((r) => r.status === "protected" || r.status === "owner-only");

console.log("=== API Security Audit ===\n");
console.log(`Total routes: ${rows.length}`);
console.log(`Protected (user/session): ${protectedRoutes.length}`);
console.log(`Owner-only: ${ownerRoutes.length}`);
console.log(`Intentional public: ${publicRoutes.length}`);
console.log(`Missing auth: ${missing.length}\n`);

if (missing.length) {
  console.log("MISSING AUTH:");
  for (const m of missing) console.log(`  - ${m.rel}`);
} else {
  console.log("All non-public routes have authentication.");
}

console.log("\nIntentional public routes:");
for (const p of publicRoutes) console.log(`  - ${p.rel}`);
