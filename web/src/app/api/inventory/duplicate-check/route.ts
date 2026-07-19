import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";

/**
 * Duplicate check is disabled in the main request path due to native Sharp/AI
 * SIGABRT crashes on Vercel serverless (munmap_chunk / free invalid size).
 * Returns "no duplicate" immediately so inventory save is never blocked.
 * TODO: move to isolated AI worker when worker health is restored.
 */
export async function POST(req: NextRequest) {
  const perf = createPerfTimer("POST /api/inventory/duplicate-check");
  perf.mark("auth");
  const user = await requireOwner();
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  try {
    await req.formData();
  } catch {
    return jsonError("Invalid request", 400);
  }

  const timings = perf.finish({ kind: "skip" });
  return withServerTiming(
    jsonOk({
      ok: true,
      is_duplicate: false,
      threshold: 0.85,
      checked_count: 0,
      match: null,
      _skipped: "native-crash-guard",
    }),
    timings,
  );
}
