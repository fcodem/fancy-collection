import { isResponse, jsonError, jsonOk, requireUserReadOnly } from "@/lib/api";
import { getShopRevision } from "@/lib/realtime/revision";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Lightweight revision endpoint for polling-mode realtime.
 * Returns a monotonic string; clients only refresh lists when it changes.
 */
export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  try {
    const rev = await getShopRevision();
    return jsonOk({ rev });
  } catch (e) {
    console.error("[realtime/revision]", e instanceof Error ? e.message : e);
    return jsonError("Failed to load shop revision", 500);
  }
}
