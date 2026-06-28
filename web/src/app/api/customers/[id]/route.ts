import { NextRequest } from "next/server";
import { getCustomer, updateCustomer, deleteCustomer } from "@/lib/services/customersOps";
import { jsonError, jsonOk, requireUser, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  const customer = await getCustomer(parseInt(id, 10));
  if (!customer) return jsonError("Not found", 404);
  return jsonOk(customer);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const customer = await updateCustomer(parseInt(id, 10), body);
    return jsonOk({ ok: true, id: customer.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await deleteCustomer(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
