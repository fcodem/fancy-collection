import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs";
import { measureTmpFreeBytes, measureSlipTempUsage } from "@/lib/slipTempCleanup";

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

    return NextResponse.json({
      freeTmpBytes: freeTmpBytes ?? 0,
      freeTmpMB: freeTmpBytes != null ? Math.round(freeTmpBytes / (1024 * 1024)) : null,
      slipTempUsageBytes: slipTempUsage,
      sparticuzExtractPresent: sparticuzMarkers.length > 0,
      sparticuzMarkers,
      activeRenders: 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Health check failed" },
      { status: 500 },
    );
  }
}
