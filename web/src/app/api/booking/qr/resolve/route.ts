import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireUserReadOnly } from "@/lib/api";
import { createPerfTimer, withServerTiming } from "@/lib/perfTiming";
import { resolveBookingQr } from "@/lib/services/qrResolve";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Fast, secure QR resolver for the in-app scanner.
 * Signature is verified before any booking query; no backfill / mutation / relations.
 */
export async function POST(req: NextRequest) {
  const perf = createPerfTimer("qr-resolve");

  perf.mark("auth");
  const user = await requireUserReadOnly();
  perf.endStage("cookieAuthMs", "auth");
  perf.endStage("authMs", "auth");
  if (isResponse(user)) return user;

  let body: { token?: unknown; signature?: unknown; target?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const token = typeof body.token === "string" ? body.token : "";
  const signature = typeof body.signature === "string" ? body.signature : null;
  const target = typeof body.target === "string" ? body.target : null;

  if (!token.trim()) {
    return jsonError("Missing QR token", 400);
  }

  try {
    const { outcome, timings } = await resolveBookingQr({ token, signature, target });
    perf.set("signatureMs", timings.signatureMs);
    perf.set("resolverDbMs", timings.resolverDbMs);
    perf.setCacheStatus(timings.cacheStatus);

    if (!outcome.ok) {
      // Do not reveal whether an unsigned/arbitrary token exists.
      const stages = perf.finish({ kind: "read" });
      const status = outcome.reason === "invalid_signature" ? 401 : 404;
      return withServerTiming(
        jsonError("This QR code could not be opened.", status, {
          code: outcome.reason === "invalid_signature" ? "QR_INVALID" : "QR_NOT_FOUND",
          retryable: false,
        }),
        stages,
      );
    }

    const stages = perf.finish({ kind: "read" });
    return withServerTiming(
      jsonOk({ ok: true, bookingId: outcome.bookingId, target: outcome.url }),
      stages,
    );
  } catch (e) {
    console.error("[qr-resolve]", e instanceof Error ? e.message : e);
    return jsonError("Could not resolve QR code. Please try again.", 500, {
      retryable: true,
    });
  }
}
