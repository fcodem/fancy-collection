import prisma from "@/lib/prisma";
import { saveInventoryThumbnailFromBuffer } from "@/lib/upload";
import { deletePermanentInventoryImage } from "@/lib/storage/publicInventoryMedia";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export type ThumbnailBackfillSummary = {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
  remaining: number;
};

async function fetchSourcePhoto(ref: string): Promise<Buffer | null> {
  if (!/^https:\/\//i.test(ref)) return null;
  try {
    const res = await fetch(ref, { cache: "no-store" });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_SOURCE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= MAX_SOURCE_BYTES ? buf : null;
  } catch {
    return null;
  }
}

const missingThumbWhere = {
  photo: { not: null },
  NOT: { photo: "" },
  OR: [{ thumbnailPhoto: null }, { thumbnailPhoto: "" }],
};

/**
 * Fills `thumbnail_photo` only where it is empty. Never touches `photo` or any other
 * column, so it is safe to re-run and safe alongside a concurrent run.
 */
export async function backfillInventoryThumbnails(opts: {
  batchSize?: number;
  budgetMs?: number;
  afterId?: number;
} = {}): Promise<ThumbnailBackfillSummary & { lastId: number }> {
  const batchSize = Math.max(1, Math.min(50, opts.batchSize ?? 15));
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);
  const summary = { scanned: 0, updated: 0, skipped: 0, failed: 0, remaining: 0 };
  let lastId = opts.afterId ?? 0;

  const rows = await prisma.clothingItem.findMany({
    where: { ...missingThumbWhere, id: { gt: lastId } },
    select: { id: true, photo: true },
    orderBy: { id: "asc" },
    take: batchSize,
  });

  for (const row of rows) {
    if (Date.now() > deadline) break;
    summary.scanned += 1;
    lastId = row.id;
    const source = row.photo?.trim() || "";
    const buf = await fetchSourcePhoto(source);
    if (!buf) {
      summary.skipped += 1;
      continue;
    }
    const thumb = await saveInventoryThumbnailFromBuffer(buf);
    if (!thumb) {
      summary.failed += 1;
      continue;
    }
    const res = await prisma.clothingItem.updateMany({
      where: { id: row.id, OR: [{ thumbnailPhoto: null }, { thumbnailPhoto: "" }] },
      data: { thumbnailPhoto: thumb },
    });
    if (res.count === 1) {
      summary.updated += 1;
    } else {
      summary.skipped += 1;
      await deletePermanentInventoryImage(thumb, { allowInventoryReplacement: true }).catch(() => {});
    }
  }

  summary.remaining = await prisma.clothingItem.count({ where: missingThumbWhere });
  return { ...summary, lastId };
}
