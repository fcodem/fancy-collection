import { resetAllData } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    if (body.confirm !== "DELETE ALL DATA") return jsonError("Confirmation phrase required");
    await resetAllData();
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
