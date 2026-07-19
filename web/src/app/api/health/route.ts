import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/api";
import { getPublicHealthStatus } from "@/lib/dressChecker/publicHealthStatus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Load-balancer / ops health probe.
 * Does not require auth. Never returns secrets.
 */
export async function GET(_req: NextRequest) {
  const status = await getPublicHealthStatus();
  const httpStatus = status.database === "OK" ? 200 : 503;
  return jsonOk(status, httpStatus);
}
