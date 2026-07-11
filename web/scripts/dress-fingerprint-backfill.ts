import { PrismaClient } from "@prisma/client";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import {
  buildDeterministicInventoryAiFingerprint,
  hashImageBuffer,
  INVENTORY_AI_FINGERPRINT_VERSION,
  upsertInventoryAiFingerprint,
} from "../src/lib/dressChecker/inventoryAiFingerprint";
import type { FeatureFingerprint } from "../src/lib/dressChecker/types";
import { DRESS_CHECKER_ENGINE_VERSION } from "../src/lib/dressChecker/constants";

const prisma = new PrismaClient();

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argNumber(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = Number(hit.split("=").slice(1).join("="));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const dryRun = hasArg("dry-run");
  const resume = hasArg("resume");
  const limit = argNumber("limit", 500);

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      item_id: number;
      sku: string;
      photo: string;
      recognition_fingerprint: unknown;
      profile_photo_hash: string | null;
      existing_hash: string | null;
      existing_version: number | null;
    }>
  >(
    `SELECT c.id AS item_id, c.sku, c.photo, p.recognition_fingerprint, p.photo_hash AS profile_photo_hash,
            f.input_image_hash AS existing_hash, f.fingerprint_version AS existing_version
     FROM clothing_items c
     JOIN inventory_ai_profiles p ON p.item_id = c.id
     LEFT JOIN LATERAL (
       SELECT input_image_hash, fingerprint_version
       FROM inventory_ai_fingerprints f
       WHERE f.item_id = c.id
         AND f.fingerprint_version = $1
         AND f.validation_status = 'VALID'
       ORDER BY f.updated_at DESC
       LIMIT 1
     ) f ON true
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND p.ai_status = 'READY'
       AND p.recognition_fingerprint IS NOT NULL
     ORDER BY c.id ASC
     LIMIT $2`,
    INVENTORY_AI_FINGERPRINT_VERSION,
    limit,
  );

  const candidates = rows.filter((row) => {
    if (!resume) return true;
    return !row.existing_hash || row.existing_version !== INVENTORY_AI_FINGERPRINT_VERSION;
  });
  const cached = rows.length - candidates.length;
  const openAiCallsRequired = 0;

  console.log(
    JSON.stringify(
      {
        dryRun,
        resume,
        eligibleReadyItems: rows.length,
        cachedCurrentFingerprints: cached,
        deterministicWritesRequired: candidates.length,
        openAiCallsRequired,
        maxOpenAiCallsPerRun: Number(process.env.DRESS_CHECKER_MAX_OPENAI_CALLS_PER_RUN || 0),
        engineVersion: DRESS_CHECKER_ENGINE_VERSION,
        fingerprintVersion: INVENTORY_AI_FINGERPRINT_VERSION,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  let written = 0;
  for (const row of candidates) {
    const buffer = await loadPhotoBuffer(row.photo);
    if (!buffer) {
      console.warn(`[fingerprint-backfill] skip item=${row.item_id} sku=${row.sku}: photo load failed`);
      continue;
    }
    const imageHash = row.profile_photo_hash || hashImageBuffer(buffer);
    const fp = buildDeterministicInventoryAiFingerprint(row.recognition_fingerprint as FeatureFingerprint);
    await upsertInventoryAiFingerprint({
      itemId: row.item_id,
      imageHash,
      sourceImage: row.photo,
      fingerprint: fp,
      deterministicJson: row.recognition_fingerprint,
    });
    written++;
    console.log(`[fingerprint-backfill] written item=${row.item_id} sku=${row.sku} hash=${imageHash.slice(0, 12)}`);
  }

  console.log(JSON.stringify({ written, openAiCallsConsumed: 0 }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
