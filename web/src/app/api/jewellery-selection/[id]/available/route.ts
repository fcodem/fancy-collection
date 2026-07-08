import { getAvailableJewellery } from "@/lib/services/jewelleryOps";
import { jsonError, jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) return jsonError("Invalid booking");
  const category = new URL(req.url).searchParams.get("category")?.trim() || "";
  try {
    const data = await getAvailableJewellery(bookingId, category);
    return jsonOk(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
