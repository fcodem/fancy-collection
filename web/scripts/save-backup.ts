/**
 * Export full JSON backup to web/backups/ (run: npm run db:backup)
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import prisma from "../src/lib/prisma";
import { buildFullBackup } from "../src/lib/backupData";

async function main() {
  const backup = await buildFullBackup("save-backup-script");
  const dir = path.join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `fancy-collection-backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2), "utf8");

  const c = backup.meta.record_counts;
  console.log("Backup saved:", file);
  console.log("Records:", JSON.stringify(c, null, 2));
}

main()
  .catch((e) => {
    console.error("Backup failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
