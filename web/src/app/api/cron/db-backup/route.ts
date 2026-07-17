import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { jsonError, jsonOk } from "@/lib/api";
import { buildFullBackup } from "@/lib/backupData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Daily automated backup: JSON export uploaded to Vercel Blob when token is set.
 * Also keep Supabase dashboard automatic backups enabled (ops).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const backup = await buildFullBackup("cron-db-backup");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backups/fancy-collection-backup-${stamp}.json`;
    const body = JSON.stringify(backup);
    const bytes = Buffer.byteLength(body, "utf8");

    let blobUrl: string | null = null;
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (token) {
      const uploaded = await put(filename, body, {
        access: "private",
        contentType: "application/json",
        token,
        addRandomSuffix: true,
      });
      blobUrl = uploaded.url;
    } else {
      console.warn(
        "[cron/db-backup] BLOB_READ_WRITE_TOKEN missing — backup built but not uploaded off-box",
      );
    }

    return jsonOk({
      ok: true,
      filename,
      bytes,
      blobUrl,
      uploaded: Boolean(blobUrl),
      record_counts: backup.meta.record_counts,
      restore_drill:
        "Run: npx tsx scripts/restore-backup-drill.ts --file <path-or-download>",
    });
  } catch (e) {
    console.error("[cron/db-backup]", e);
    return jsonError(e instanceof Error ? e.message : "Backup failed", 500);
  }
}
