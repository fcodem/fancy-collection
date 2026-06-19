import { NextRequest } from "next/server";
import { listSuppliers, addSupplier } from "@/lib/services/adminOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const suppliers = await listSuppliers();
  return jsonOk(suppliers);
}

export async function POST(req: NextRequest) {
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
