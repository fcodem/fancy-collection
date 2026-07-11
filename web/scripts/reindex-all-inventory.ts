/**
 * Bulk reindex all inventory AI profiles (hashes + embeddings + inventory_ai_profiles).
 *
 * Usage:
 *   npx tsx scripts/reindex-all-inventory.ts
 *   npx tsx scripts/reindex-all-inventory.ts --force
 *   npx tsx scripts/reindex-all-inventory.ts --retry-failed
 *   npx tsx scripts/reindex-all-inventory.ts --item-ids=1048,1049
 *   npx tsx scripts/reindex-all-inventory.ts --full
 *   npx tsx scripts/reindex-all-inventory.ts --fresh
 *
 * Per item:
 *   1. Load original/uploaded image (originalPhoto || photo)
 *   2. Generate perceptual hashes
 *   3. Generate vision embeddings (FashionCLIP → SigLIP → OpenCLIP)
 *   4. Save inventory_ai_profiles (embedding_vector + hash columns)
 *   5. Retry failed profiles (automatic second pass)
 *
 * Resume: progress is saved to scripts/.reindex-checkpoint.json after each item.
 * Skip: already-complete profiles are not reprocessed (use --force to rebuild all).
 */
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { isPgvectorAvailable } from "../src/lib/ai/pgvector";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { indexImageBuffers } from "../src/lib/dressChecker/indexingService";
import { processInventoryAiProfile } from "../src/lib/dressChecker/processInventory";

const prisma = new PrismaClient();

const CHECKPOINT_PATH = join(process.cwd(), "scripts", ".reindex-checkpoint.json");

const CONCURRENCY = Math.max(1, Number(process.env.REINDEX_CONCURRENCY || 1));
const FORCE = process.argv.includes("--force");
const FRESH = process.argv.includes("--fresh");
const RETRY_FAILED_ONLY = process.argv.includes("--retry-failed");
const FULL_IDENTITY = process.argv.includes("--full");
const itemIdsArg = process.argv.find((a) => a.startsWith("--item-ids="));
const ITEM_IDS = itemIdsArg
  ? itemIdsArg
      .replace("--item-ids=", "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter(Boolean)
  : null;

type InventoryRow = {
  id: number;
  sku: string;
  photo: string | null;
  originalPhoto: string | null;
};

type FailedEntry = {
  itemId: number;
  sku: string;
  error: string;
  at: string;
};

type Checkpoint = {
  version: 1;
  startedAt: string;
  updatedAt: string;
  mode: string;
  total: number;
  completed: number[];
  skipped: number[];
  failed: FailedEntry[];
};

type ItemOutcome = "indexed" | "skipped" | "failed";

let checkpoint: Checkpoint | null = null;
let shuttingDown = false;

function parseArgsMode(): string {
  if (ITEM_IDS?.length) return `item-ids:${ITEM_IDS.join(",")}`;
  if (RETRY_FAILED_ONLY) return "retry-failed";
  if (FORCE) return "force-all";
  return "missing-or-incomplete";
}

async function loadCheckpoint(): Promise<Checkpoint | null> {
  if (FRESH) return null;
  try {
    const raw = await readFile(CHECKPOINT_PATH, "utf8");
    const data = JSON.parse(raw) as Checkpoint;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

async function saveCheckpoint(state: Checkpoint): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(join(process.cwd(), "scripts"), { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(state, null, 2), "utf8");
}

function originalImageRef(item: InventoryRow): string {
  return item.originalPhoto || item.photo || "";
}

async function hasPgvectorEmbedding(itemId: number, pgOk: boolean): Promise<boolean> {
  if (pgOk) {
    const rows = await prisma.$queryRawUnsafe<Array<{ has: boolean }>>(
      `SELECT embedding_vector IS NOT NULL AS has
       FROM inventory_ai_profiles WHERE item_id = $1`,
      itemId,
    );
    return !!rows[0]?.has;
  }
  const profile = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    select: { imageEmbeddingJson: true },
  });
  return profile?.imageEmbeddingJson != null;
}

async function isProfileComplete(itemId: number, pgOk: boolean): Promise<boolean> {
  const profile = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    select: {
      photoHash: true,
      differenceHash: true,
      processingError: true,
      status: true,
    },
  });
  if (!profile) return false;
  if (profile.processingError) return false;
  if (!profile.photoHash || !profile.differenceHash) return false;
  if (!["ready", "completed"].includes(profile.status)) return false;
  return hasPgvectorEmbedding(itemId, pgOk);
}

function printProgress(indexed: number, total: number, failed: number, skipped: number) {
  process.stdout.write(`\rIndexed: ${indexed}/${total}  (failed: ${failed}, skipped: ${skipped})`);
}

function markCompleted(state: Checkpoint, itemId: number) {
  if (!state.completed.includes(itemId)) state.completed.push(itemId);
  state.failed = state.failed.filter((f) => f.itemId !== itemId);
}

function markSkipped(state: Checkpoint, itemId: number) {
  if (!state.skipped.includes(itemId)) state.skipped.push(itemId);
}

async function reindexOneItem(
  item: InventoryRow,
  pgOk: boolean,
  reason: string,
): Promise<ItemOutcome> {
  const photoPath = originalImageRef(item);
  if (!photoPath) {
    throw new Error("No photo on inventory item");
  }

  if (!FORCE) {
    const done = await isProfileComplete(item.id, pgOk);
    if (done) return "skipped";
  }

  const buffer = await loadPhotoBuffer(photoPath);
  if (!buffer) {
    throw new Error(`Could not load image: ${photoPath}`);
  }

  await indexImageBuffers(item.id, buffer, reason);

  if (FULL_IDENTITY) {
    const ok = await processInventoryAiProfile(item.id, reason);
    if (!ok) throw new Error("Full AI profile build returned false");
  }

  return "indexed";
}

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (idx < items.length && !shuttingDown) {
      const i = idx++;
      await worker(items[i]);
    }
  });
  await Promise.all(workers);
}

async function fetchInventoryRows(): Promise<InventoryRow[]> {
  if (ITEM_IDS?.length) {
    return prisma.clothingItem.findMany({
      where: { id: { in: ITEM_IDS }, photo: { not: null }, NOT: { photo: "" } },
      select: { id: true, sku: true, photo: true, originalPhoto: true },
      orderBy: { id: "asc" },
    });
  }

  if (RETRY_FAILED_ONLY) {
    const failed = await prisma.inventoryAiProfile.findMany({
      where: {
        OR: [
          { status: { in: ["failed", "error"] } },
          { processingError: { not: null } },
        ],
      },
      select: { itemId: true },
    });
    const ids = failed.map((f) => f.itemId);
    if (!ids.length) return [];
    return prisma.clothingItem.findMany({
      where: { id: { in: ids }, photo: { not: null }, NOT: { photo: "" } },
      select: { id: true, sku: true, photo: true, originalPhoto: true },
      orderBy: { id: "asc" },
    });
  }

  return prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: { id: true, sku: true, photo: true, originalPhoto: true },
    orderBy: { id: "asc" },
  });
}

async function processQueue(
  items: InventoryRow[],
  pgOk: boolean,
  reason: string,
  state: Checkpoint,
): Promise<{ indexed: number; skipped: number; failed: number }> {
  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  const resumeCompleted = new Set(state.completed);
  const resumeSkipped = new Set(state.skipped);
  const pending = items.filter(
    (item) => !resumeCompleted.has(item.id) && !resumeSkipped.has(item.id),
  );

  if (!pending.length) {
    printProgress(indexed, state.total, failed, skipped);
    console.log("\n[reindex] nothing left to process (resume checkpoint is complete)");
    return { indexed, skipped, failed };
  }

  await runPool(pending, async (item) => {
    if (shuttingDown) return;
    try {
      const outcome = await reindexOneItem(item, pgOk, reason);
      if (outcome === "skipped") {
        skipped++;
        markSkipped(state, item.id);
        await saveCheckpoint(state);
        printProgress(state.completed.length, state.total, state.failed.length, state.skipped.length);
        return;
      }
      indexed++;
      markCompleted(state, item.id);
      await saveCheckpoint(state);
      printProgress(state.completed.length, state.total, state.failed.length, state.skipped.length);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n[reindex] ERROR item=${item.id} sku=${item.sku}: ${msg}`);
      state.failed.push({
        itemId: item.id,
        sku: item.sku,
        error: msg,
        at: new Date().toISOString(),
      });
      await saveCheckpoint(state);
      printProgress(state.completed.length, state.total, state.failed.length, state.skipped.length);
    }
  });

  console.log("");
  return { indexed, skipped, failed };
}

async function retryFailedPass(
  state: Checkpoint,
  pgOk: boolean,
): Promise<{ indexed: number; failed: number }> {
  const retryIds = [...new Set(state.failed.map((f) => f.itemId))];
  if (!retryIds.length) return { indexed: 0, failed: 0 };

  console.log(`[reindex] retry pass: ${retryIds.length} failed profile(s)`);

  const items = await prisma.clothingItem.findMany({
    where: { id: { in: retryIds }, photo: { not: null }, NOT: { photo: "" } },
    select: { id: true, sku: true, photo: true, originalPhoto: true },
    orderBy: { id: "asc" },
  });

  let indexed = 0;
  let failed = 0;

  for (const item of items) {
    if (shuttingDown) break;
    try {
      await reindexOneItem(item, pgOk, "bulk_reindex_retry");
      indexed++;
      markCompleted(state, item.id);
      await saveCheckpoint(state);
      printProgress(state.completed.length, state.total, state.failed.length, state.skipped.length);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n[reindex] RETRY ERROR item=${item.id} sku=${item.sku}: ${msg}`);
      const existing = state.failed.find((f) => f.itemId === item.id);
      if (existing) {
        existing.error = msg;
        existing.at = new Date().toISOString();
      } else {
        state.failed.push({
          itemId: item.id,
          sku: item.sku,
          error: msg,
          at: new Date().toISOString(),
        });
      }
      await saveCheckpoint(state);
    }
  }

  console.log("");
  return { indexed, failed };
}

async function printDbStats() {
  const stats = await prisma.$queryRawUnsafe<
    Array<{ total: number; ready: number; failed: number; with_embedding: number; with_hash: number }>
  >(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('ready','completed'))::int AS ready,
       COUNT(*) FILTER (WHERE status IN ('failed','error'))::int AS failed,
       COUNT(*) FILTER (WHERE embedding_vector IS NOT NULL)::int AS with_embedding,
       COUNT(*) FILTER (WHERE photo_hash IS NOT NULL AND difference_hash IS NOT NULL)::int AS with_hash
     FROM inventory_ai_profiles`,
  ).catch(() => [{ total: 0, ready: 0, failed: 0, with_embedding: 0, with_hash: 0 }]);
  console.log("[reindex] DB stats:", stats[0]);
}

async function main() {
  const mode = parseArgsMode();
  console.log("[reindex] starting mode=", mode);
  console.log("[reindex] concurrency=", CONCURRENCY, "force=", FORCE, "full_identity=", FULL_IDENTITY);

  const pgOk = await isPgvectorAvailable();
  console.log("[reindex] pgvector=", pgOk ? "yes" : "no (using image_embedding_json fallback)");

  const items = await fetchInventoryRows();
  if (!items.length) {
    console.log("[reindex] no items to process");
    return;
  }

  const loaded = await loadCheckpoint();
  const sameRun =
    loaded &&
    loaded.mode === mode &&
    loaded.total === items.length &&
    !FORCE &&
    !FRESH;

  checkpoint = sameRun
    ? loaded
    : {
        version: 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode,
        total: items.length,
        completed: [],
        skipped: [],
        failed: [],
      };

  if (sameRun && (checkpoint.completed.length || checkpoint.skipped.length)) {
    console.log(
      `[reindex] resuming checkpoint: ${checkpoint.completed.length} done, ${checkpoint.skipped.length} skipped, ${checkpoint.failed.length} failed`,
    );
  }

  const state = checkpoint;
  state.total = items.length;

  const firstPass = await processQueue(items, pgOk, "bulk_reindex", state);

  let retryIndexed = 0;
  let retryFailed = 0;
  if (!shuttingDown && state.failed.length > 0) {
    const retry = await retryFailedPass(state, pgOk);
    retryIndexed = retry.indexed;
    retryFailed = retry.failed;
  }

  console.log("[reindex] summary");
  console.log(
    `  Indexed: ${firstPass.indexed + retryIndexed}/${state.total}  skipped: ${firstPass.skipped}  failed: ${state.failed.length}`,
  );

  if (state.failed.length) {
    console.log("[reindex] errors:");
    for (const f of state.failed) {
      console.log(`  - item ${f.itemId} (${f.sku}): ${f.error}`);
    }
  } else {
    console.log("[reindex] no errors");
  }

  await printDbStats();

  if (state.failed.length === 0 && state.completed.length + state.skipped.length >= state.total) {
    console.log("[reindex] complete — checkpoint can be cleared with --fresh on next run");
  } else if (shuttingDown) {
    console.log(`[reindex] interrupted — resume with: npx tsx scripts/reindex-all-inventory.ts`);
    console.log(`[reindex] checkpoint: ${CHECKPOINT_PATH}`);
  }
}

function setupSignalHandlers() {
  const onSignal = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[reindex] shutdown requested — saving checkpoint…");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

setupSignalHandlers();

main()
  .catch((e) => {
    console.error("[reindex] fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
