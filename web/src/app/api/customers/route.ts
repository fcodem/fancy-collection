import { NextRequest } from "next/server";
import { listCustomers, createCustomer } from "@/lib/services/customersOps";
import { jsonError, jsonOk, requireUser, requireUserReadOnly, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const q = req.nextUrl.searchParams.get("q") || "";
  const category = req.nextUrl.searchParams.get("category") || "";
  const customers = await listCustomers(q, category);
  return jsonOk(customers);
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireUser();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const customer = await createCustomer(body);
    return jsonOk({ ok: true, id: customer.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
