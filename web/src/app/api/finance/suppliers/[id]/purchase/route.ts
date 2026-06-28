import { NextRequest } from "next/server";
import { addSupplierPurchase } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const purchase = await addSupplierPurchase(parseInt(id, 10), body);
    return jsonOk({ ok: true, id: purchase.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
