/**
 * Restore drill — validates a backup JSON without writing to the live database.
 *
 * Usage:
 *   npx tsx scripts/restore-backup-drill.ts --file backups/fancy-collection-backup-….json
 *
 * Exit 0 = structure OK for restore planning. Does NOT apply data to production.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { BACKUP_VERSION } from "../src/lib/backupData";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1]!;
}

function main() {
  const fileArg = argValue("--file");
  if (!fileArg) {
    console.error("Usage: npx tsx scripts/restore-backup-drill.ts --file <backup.json>");
    process.exit(1);
  }
  const file = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!existsSync(file)) {
    console.error("File not found:", file);
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const data = JSON.parse(raw) as {
    meta?: { version?: string; record_counts?: Record<string, number>; exported_at?: string };
    bookings?: unknown[];
    customers?: unknown[];
    clothing_items?: unknown[];
    users?: unknown[];
  };

  const errors: string[] = [];
  if (!data.meta) errors.push("missing meta");
  if (data.meta?.version && data.meta.version !== BACKUP_VERSION) {
    console.warn(`Version mismatch: backup=${data.meta.version} expected=${BACKUP_VERSION}`);
  }
  for (const key of ["bookings", "customers", "clothing_items"] as const) {
    if (!Array.isArray(data[key])) errors.push(`missing array: ${key}`);
  }

  if (errors.length) {
    console.error("RESTORE_DRILL_FAIL", errors.join("; "));
    process.exit(1);
  }

  console.log("RESTORE_DRILL_OK");
  console.log(
    JSON.stringify(
      {
        file,
        exported_at: data.meta?.exported_at ?? null,
        version: data.meta?.version ?? null,
        record_counts: data.meta?.record_counts ?? null,
        note: "Validated only — restore into a SEPARATE Supabase project, never overwrite live DB blindly.",
      },
      null,
      2,
    ),
  );
}

main();
