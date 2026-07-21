import { NextRequest, NextResponse } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  runAllPremiumSlipRenderTests,
  runPremiumSlipRenderTest,
  runPremiumSlipSendTest,
  getPremiumSlipTestPdf,
  type PremiumSlipTestKind,
} from "@/lib/services/premiumSlipVerification";

const KINDS = new Set<PremiumSlipTestKind>(["booking", "delivery", "return", "incomplete"]);

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId =
      body.bookingId != null ? Number(body.bookingId) : undefined;
    const kind = body.kind as PremiumSlipTestKind | "all" | undefined;
    const testPhone = typeof body.testPhone === "string" ? body.testPhone.trim() : "";
    const sendToTest = Boolean(body.sendToTest);
    const runId = typeof body.runId === "string" ? body.runId : undefined;
    const requestOrigin = req.nextUrl.origin;

    if (sendToTest) {
      if (!testPhone) {
        return jsonError("Approved test phone is required for send", 400);
      }
      if (!kind || kind === "all" || !KINDS.has(kind)) {
        return jsonError("Specify a single slip kind to send", 400);
      }
      if (!runId) {
        return jsonError("runId required — render the slip before sending", 400);
      }
      const send = await runPremiumSlipSendTest({ runId, kind, testPhone });
      return jsonOk({ ok: send.ok, send });
    }

    if (kind === "all") {
      const summary = await runAllPremiumSlipRenderTests({ bookingId, requestOrigin });
      return jsonOk({ ok: true, ...summary });
    }

    const resolvedKind = (kind && KINDS.has(kind) ? kind : "booking") as PremiumSlipTestKind;
    const result = await runPremiumSlipRenderTest({
      kind: resolvedKind,
      bookingId,
      requestOrigin,
      runId,
    });
    return jsonOk({ ok: result.render.ok, ...result });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Premium slip test failed", 500);
  }
}

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const token = req.nextUrl.searchParams.get("download");
  if (token) {
    const entry = getPremiumSlipTestPdf(token);
    if (!entry) return jsonError("Download expired or not found", 404);
    const bytes = new Uint8Array(entry.pdf);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="premium-${entry.kind}-${entry.bookingId}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }

  return jsonError("Missing download token", 400);
}
