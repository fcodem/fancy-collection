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
    const chromiumDir = `${os.tmpdir()}/fc-chromium-v149`;
    const chromiumReady = fs.existsSync(`${chromiumDir}/chromium`);

    return NextResponse.json({
      freeTmpBytes: freeTmpBytes ?? 0,
      freeTmpMB: freeTmpBytes != null ? Math.round(freeTmpBytes / (1024 * 1024)) : null,
      slipTempUsageBytes: slipTempUsage,
      chromiumReady,
      activeRenders: 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Health check failed" },
      { status: 500 },
    );
  }
}
