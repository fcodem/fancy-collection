import { getBlobStorageConfig } from "@/lib/upload";
import { isResponse, jsonOk, requireOwner } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only: whether public and private Blob tokens are configured (never exposes values). */
export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  return jsonOk(getBlobStorageConfig());
}
