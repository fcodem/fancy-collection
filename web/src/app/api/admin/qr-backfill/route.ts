import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import {
  countBookingsMissingQrToken,
  qrBackfillPreflight,
  runQrBackfill,
} from "@/lib/bookingQr";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET: report how many historical bookings still lack a QR token and whether the
 * fast set-based path (gen_random_uuid) is available on THIS database (owner only).
 * Run this against staging before any production backfill.
 */
export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const [remaining, preflight] = await Promise.all([
    countBookingsMissingQrToken(),
    qrBackfillPreflight(),
  ]);
  return jsonOk({ remaining, preflight });
}

/**
 * POST: explicit, batched, resumable QR-token backfill for historical bookings.
 * Owner only. Never runs automatically and never during a scan.
 */
export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  let body: { batchSize?: unknown; maxBatches?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body allowed */
  }
  const batchSize =
    typeof body.batchSize === "number" && body.batchSize > 0 ? body.batchSize : 500;
  const maxBatches =
    typeof body.maxBatches === "number" && body.maxBatches > 0 ? body.maxBatches : 40;

  try {
    const result = await runQrBackfill({ batchSize, maxBatches });
    return jsonOk({ ok: true, ...result });
  } catch (e) {
    console.error("[qr-backfill]", e instanceof Error ? e.message : e);
    return jsonError("QR backfill failed", 500);
  }
}
