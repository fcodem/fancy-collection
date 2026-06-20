import { NextRequest } from "next/server";
import { getSupplierPurchaseSummary } from "@/lib/services/adminOps";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const from = req.nextUrl.searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to") || from;
  const summary = await getSupplierPurchaseSummary(parseInt(id, 10), from, to);
  return jsonOk(summary);
}
