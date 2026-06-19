import { NextRequest } from "next/server";
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { jsonOk } from "@/lib/api";

const LOG_PATH = join(process.cwd(), "..", ".cursor", "debug-5772a5.log");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${JSON.stringify({ ...body, timestamp: Date.now() })}\n`, "utf8");
  } catch {
    /* ignore */
  }
  return jsonOk({ ok: true });
}
