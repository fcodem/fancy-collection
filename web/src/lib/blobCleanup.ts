import "server-only";

import prisma from "@/lib/prisma";
import { deleteUploads } from "@/lib/upload";

/** Enqueue Blob paths for deletion AFTER the business transaction commits. */
export async function enqueueBlobCleanup(
  paths: Array<string | null | undefined>,
  opts: { reason: string; bookingId?: number },
): Promise<void> {
  const unique = [
    ...new Set(
      paths
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim()),
    ),
  ];
  if (!unique.length) return;
  try {
    for (const blobPath of unique) {
      const active = await prisma.blobCleanupJob.findFirst({
        where: { blobPath, status: { in: ["pending", "processing"] } },
        select: { id: true },
      });
      if (active) continue;
      await prisma.blobCleanupJob.create({
        data: {
          blobPath,
          reason: opts.reason,
          bookingId: opts.bookingId ?? null,
          status: "pending",
          scheduledAt: new Date(),
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|P2021|Unknown arg/i.test(msg)) {
      console.error("[blobCleanup] schema unavailable — refusing unsafe immediate delete");
      return;
    }
    console.error("[blobCleanup] enqueue failed:", msg.slice(0, 120));
  }
}

/** True if any business table still references this blob path. */
export async function isBlobPathStillReferenced(blobPath: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ still: boolean }>>`
    SELECT (
      EXISTS (
        SELECT 1 FROM bookings
        WHERE id_photo_1 = ${blobPath}
           OR id_photo_2 = ${blobPath}
           OR incomplete_photo = ${blobPath}
      )
      OR EXISTS (
        SELECT 1 FROM booking_items WHERE item_incomplete_photo = ${blobPath}
      )
      OR EXISTS (
        SELECT 1 FROM clothing_items
        WHERE photo = ${blobPath}
           OR original_photo = ${blobPath}
           OR enhanced_photo = ${blobPath}
           OR marketing_photo = ${blobPath}
           OR recognition_image = ${blobPath}
      )
      OR EXISTS (
        SELECT 1 FROM clothing_item_reference_photos WHERE photo = ${blobPath}
      )
      OR EXISTS (
        SELECT 1 FROM booking_orders WHERE photo = ${blobPath}
      )
      OR EXISTS (
        SELECT 1 FROM booking_jewellery WHERE photo = ${blobPath}
      )
    ) AS still
  `;
  return Boolean(rows[0]?.still);
}

type ClaimedCleanupJob = {
  id: number;
  blob_path: string;
  attempts: number;
  max_attempts: number;
};

async function claimCleanupJobs(limit: number, workerId: string): Promise<ClaimedCleanupJob[]> {
  const leaseMs = 120_000;
  const leaseExpires = new Date(Date.now() + leaseMs);
  return prisma.$queryRaw<ClaimedCleanupJob[]>`
    WITH cte AS (
      SELECT id
      FROM blob_cleanup_jobs
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE blob_cleanup_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      claimed_at = NOW(),
      lease_expires_at = ${leaseExpires},
      claimed_by = ${workerId}
    FROM cte
    WHERE j.id = cte.id
    RETURNING j.id, j.blob_path, j.attempts, j.max_attempts
  `;
}

export async function processBlobCleanupJobs(limit = 20) {
  const workerId = `blob-${process.pid}-${Date.now().toString(36)}`;
  let jobs: ClaimedCleanupJob[] = [];
  try {
    jobs = await claimCleanupJobs(limit, workerId);
  } catch {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date();

  for (const job of jobs) {
    try {
      if (await isBlobPathStillReferenced(job.blob_path)) {
        await prisma.blobCleanupJob.update({
          where: { id: job.id },
          data: {
            status: "skipped",
            lastError: "still_referenced",
            completedAt: now,
            leaseExpiresAt: null,
            claimedBy: null,
          },
        });
        skipped += 1;
        continue;
      }

      await deleteUploads([job.blob_path]);
      await prisma.blobCleanupJob.update({
        where: { id: job.id },
        data: {
          status: "done",
          completedAt: now,
          lastError: null,
          leaseExpiresAt: null,
          claimedBy: null,
        },
      });
      succeeded += 1;
    } catch (e) {
      const err = e instanceof Error ? e.message : "cleanup failed";
      const giveUp = job.attempts >= job.max_attempts;
      await prisma.blobCleanupJob.update({
        where: { id: job.id },
        data: {
          status: giveUp ? "failed" : "pending",
          lastError: err.slice(0, 500),
          scheduledAt: giveUp ? now : new Date(Date.now() + Math.min(30, job.attempts) * 60_000),
          leaseExpiresAt: null,
          claimedBy: null,
          ...(giveUp ? { completedAt: now } : {}),
        },
      });
      failed += 1;
    }
  }
  return { processed: jobs.length, succeeded, failed, skipped };
}
