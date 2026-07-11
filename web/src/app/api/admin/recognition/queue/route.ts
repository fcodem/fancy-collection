import { isResponse, jsonOk, requireOwner } from "@/lib/api";
import { getAiQueueSnapshot } from "@/lib/inventoryAiProfile/queue";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  return jsonOk({ ok: true, queue: getAiQueueSnapshot() });
}
