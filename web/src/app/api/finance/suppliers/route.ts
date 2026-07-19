import { listSuppliers, addSupplier } from "@/lib/services/adminOps";
import { handleFinanceGet } from "@/lib/finance/financeApiRoute";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET() {
  return handleFinanceGet(async () => {
    const suppliers = await listSuppliers();
    return Array.isArray(suppliers) ? suppliers : [];
  }, "Suppliers");
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const supplier = await addSupplier(body);
    return jsonOk({ ok: true, id: supplier.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
