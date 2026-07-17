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
    await prisma.blobCleanupJob.createMany({
      data: unique.map((blobPath) => ({
        blobPath,
        reason: opts.reason,
        bookingId: opts.bookingId ?? null,
        status: "pending",
        scheduledAt: new Date(),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|P2021|Unknown arg/i.test(msg)) {
      // Table not migrated — best-effort immediate delete (legacy).
      void deleteUploads(unique).catch(() => {});
      return;
    }
    console.error("[blobCleanup] enqueue failed:", msg.slice(0, 120));
  }
}

export async function processBlobCleanupJobs(limit = 20) {
  const now = new Date();
  let jobs: Array<{ id: number; blobPath: string; attempts: number; maxAttempts: number }> = [];
  try {
    jobs = await prisma.blobCleanupJob.findMany({
      where: { status: "pending", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });
  } catch {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await prisma.blobCleanupJob.update({
        where: { id: job.id },
        data: { status: "processing", attempts: { increment: 1 } },
      });
      await deleteUploads([job.blobPath]);
      await prisma.blobCleanupJob.update({
        where: { id: job.id },
        data: { status: "done", completedAt: new Date(), lastError: null },
      });
      succeeded += 1;
    } catch (e) {
      const err = e instanceof Error ? e.message : "cleanup failed";
      const attempts = job.attempts + 1;
      const giveUp = attempts >= job.maxAttempts;
      await prisma.blobCleanupJob.update({
        where: { id: job.id },
        data: {
          status: giveUp ? "failed" : "pending",
          lastError: err.slice(0, 500),
          scheduledAt: giveUp ? now : new Date(Date.now() + 5 * 60_000),
          ...(giveUp ? { completedAt: now } : {}),
        },
      });
      failed += 1;
    }
  }
  return { processed: jobs.length, succeeded, failed };
}
