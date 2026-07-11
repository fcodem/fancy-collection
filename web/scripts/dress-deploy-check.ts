/**
 * Post-deploy / CI gate — fails if deployment audit finds critical issues.
 * Usage: npm run dress:deploy-check  (alias of deployment:audit --strict)
 */
import { spawnSync } from "child_process";
import { join } from "path";

const webRoot = join(__dirname, "..");
const result = spawnSync("npx", ["tsx", "scripts/deployment-audit.ts"], {
  cwd: webRoot,
  stdio: "inherit",
  shell: true,
});

if ((result.status ?? 1) !== 0) {
  console.error(
    "[dress:deploy-check] FAILED — fix criticalFailures (failed jobs, missing embeddings/signatures, worker offline, migrations) before production deploy.",
  );
}
process.exit(result.status ?? 1);
