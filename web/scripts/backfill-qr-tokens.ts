/**
 * Idempotent, resumable QR-token backfill for historical bookings.
 *
 * Usage (local/staging only — never point at production casually):
 *   npx tsx scripts/backfill-qr-tokens.ts --check     # preflight only (no writes)
 *   npx tsx scripts/backfill-qr-tokens.ts --dry       # report count only, no writes
 *   npx tsx scripts/backfill-qr-tokens.ts             # default batches
 *   npx tsx scripts/backfill-qr-tokens.ts --batch 250 --max 100
 *
 * Safe to re-run: only rows with qr_token IS NULL are touched (idempotent,
 * collision-safe via the unique index, resumable in bounded batches).
 * ALWAYS run --check against staging first to confirm gen_random_uuid().
 * This script is manual only and NEVER runs automatically during deployment.
 */
import {
  countBookingsMissingQrToken,
  qrBackfillPreflight,
  runQrBackfill,
} from "../src/lib/bookingQr";

function arg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = Number(process.argv[idx + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const checkOnly = process.argv.includes("--check");

  const preflight = await qrBackfillPreflight();
  console.log(
    `[qr-backfill] preflight: gen_random_uuid=${preflight.genRandomUuid} strategy=${preflight.strategy}` +
      (preflight.detail ? ` (${preflight.detail})` : ""),
  );
  if (!preflight.genRandomUuid) {
    console.warn(
      "[qr-backfill] WARNING: gen_random_uuid() is NOT available — the backfill will use the slower per-row fallback.\n" +
        "  On PostgreSQL enable it once with:  CREATE EXTENSION IF NOT EXISTS pgcrypto;\n" +
        "  (Verify on STAGING before running against production.)",
    );
  }

  const before = await countBookingsMissingQrToken();
  console.log(`[qr-backfill] bookings missing token: ${before}`);

  if (checkOnly) {
    console.log("[qr-backfill] --check: preflight only, no writes performed.");
    return;
  }
  if (dry) {
    console.log("[qr-backfill] --dry: no writes performed.");
    return;
  }
  if (before === 0) {
    console.log("[qr-backfill] nothing to do.");
    return;
  }

  const batchSize = arg("batch", 500);
  const maxBatches = arg("max", 200);
  const result = await runQrBackfill({ batchSize, maxBatches });
  console.log(
    `[qr-backfill] processed=${result.processed} batches=${result.batches} remaining=${result.remaining}`,
  );
  if (result.remaining > 0) {
    console.log("[qr-backfill] remaining > 0 — re-run to continue (resumable).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[qr-backfill] failed:", e);
    process.exit(1);
  });
