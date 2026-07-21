import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs";
import { measureTmpFreeBytes, measureSlipTempUsage } from "@/lib/slipTempCleanup";
import { getSlipRenderHealthSnapshot } from "@/lib/services/whatsapp/slipRenderHealth";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    const freeTmpBytes = await measureTmpFreeBytes();
    const slipTempUsage = measureSlipTempUsage();
    const tmpDir = os.tmpdir();
    const sparticuzMarkers = ["chromium", "al2023"].filter((name) =>
      fs.existsSync(`${tmpDir}/${name}`),
    );
    const renderHealth = getSlipRenderHealthSnapshot();

    return NextResponse.json({
      freeTmpBytes: freeTmpBytes ?? 0,
      freeTmpMB: freeTmpBytes != null ? Math.round(freeTmpBytes / (1024 * 1024)) : null,
      slipTempUsageBytes: slipTempUsage,
      sparticuzExtractPresent: sparticuzMarkers.length > 0,
      sparticuzMarkers,
      chromiumReady: renderHealth.chromiumReady || sparticuzMarkers.length > 0,
      activeRenders: renderHealth.activeRenders,
      lastRenderSuccess: renderHealth.lastRenderSuccess,
      lastRenderFailureCode: renderHealth.lastRenderFailureCode,
      lastRenderFailureAt: renderHealth.lastRenderFailureAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Health check failed" },
      { status: 500 },
    );
  }
}
