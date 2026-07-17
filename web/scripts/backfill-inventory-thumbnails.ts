/**
 * Backfill list thumbnails for inventory rows missing thumbnail_photo.
 *
 * Usage (never auto-run in production):
 *   CONFIRM_THUMB_BACKFILL=1 npx tsx scripts/backfill-inventory-thumbnails.ts
 *   CONFIRM_THUMB_BACKFILL=1 ALLOW_PROD_THUMB_BACKFILL=1 npx tsx scripts/backfill-inventory-thumbnails.ts
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import prisma from "../src/lib/prisma";
import { saveInventoryThumbnailFromBuffer } from "../src/lib/upload";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";

const BATCH_SIZE = 22;
const CHECKPOINT_PATH = join(process.cwd(), "scripts", ".thumb-backfill-checkpoint.json");

type Checkpoint = {
  lastId: number;
  updated: number;
  skipped: number;
  failed: number;
};

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    const raw = await readFile(CHECKPOINT_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Checkpoint>;
    return {
      lastId: Number(parsed.lastId) || 0,
      updated: Number(parsed.updated) || 0,
      skipped: Number(parsed.skipped) || 0,
      failed: Number(parsed.failed) || 0,
    };
  } catch {
    return { lastId: 0, updated: 0, skipped: 0, failed: 0 };
  }
}

async function saveCheckpoint(cp: Checkpoint) {
  await mkdir(join(process.cwd(), "scripts"), { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function assertSafeToRun() {
  if (process.env.CONFIRM_THUMB_BACKFILL !== "1") {
    console.error(
      "Refusing to run: set CONFIRM_THUMB_BACKFILL=1 to confirm thumbnail backfill.",
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_THUMB_BACKFILL !== "1") {
    console.error(
      "Refusing to run against production: set ALLOW_PROD_THUMB_BACKFILL=1 if intentional.",
    );
    process.exit(1);
  }
}

async function main() {
  assertSafeToRun();
  const cp = await loadCheckpoint();
  console.log(
    `Thumbnail backfill starting after id=${cp.lastId} (batch=${BATCH_SIZE}, resume-safe).`,
  );

  for (;;) {
    const rows = await prisma.clothingItem.findMany({
      where: {
        id: { gt: cp.lastId },
        photo: { not: null },
        NOT: { photo: "" },
        OR: [{ thumbnailPhoto: null }, { thumbnailPhoto: "" }],
      },
      select: { id: true, sku: true, photo: true, thumbnailPhoto: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    if (!rows.length) {
      console.log(
        `Done. updated=${cp.updated} skipped=${cp.skipped} failed=${cp.failed} lastId=${cp.lastId}`,
      );
      break;
    }

    for (const row of rows) {
      cp.lastId = row.id;
      if (row.thumbnailPhoto?.trim()) {
        cp.skipped += 1;
        await saveCheckpoint(cp);
        continue;
      }
      const source = row.photo?.trim();
      if (!source) {
        cp.skipped += 1;
        await saveCheckpoint(cp);
        continue;
      }

      try {
        const buf = await loadPhotoBuffer(source);
        if (!buf?.length) {
          console.warn(`skip id=${row.id} sku=${row.sku}: could not load source photo`);
          cp.failed += 1;
          await saveCheckpoint(cp);
          continue;
        }
        const thumb = await saveInventoryThumbnailFromBuffer(buf);
        if (!thumb) {
          console.warn(`skip id=${row.id} sku=${row.sku}: thumbnail generation failed`);
          cp.failed += 1;
          await saveCheckpoint(cp);
          continue;
        }
        await prisma.clothingItem.update({
          where: { id: row.id },
          data: { thumbnailPhoto: thumb },
        });
        cp.updated += 1;
        console.log(`updated id=${row.id} sku=${row.sku} (${cp.updated} total)`);
      } catch (e) {
        cp.failed += 1;
        console.warn(
          `fail id=${row.id} sku=${row.sku}:`,
          e instanceof Error ? e.message.slice(0, 120) : e,
        );
      }
      await saveCheckpoint(cp);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
