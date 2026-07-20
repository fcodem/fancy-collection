import { NextRequest } from "next/server";
import { listCustomers, listCustomersPage, createCustomer } from "@/lib/services/customersOps";
import { jsonError, jsonOk, requireUser, requireUserReadOnly, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const q = req.nextUrl.searchParams.get("q") || "";
  const category = req.nextUrl.searchParams.get("category") || "";
  const cursor = req.nextUrl.searchParams.get("cursor");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const paginated = req.nextUrl.searchParams.get("page") === "1" || cursor != null || limitParam != null;

  if (paginated) {
    const page = await listCustomersPage({
      q,
      category,
      cursor,
      limit: limitParam ? Number(limitParam) : 50,
    });
    const res = jsonOk(page);
    res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    return res;
  }

  // Legacy full list (export / older clients). Prefer ?limit= for UI.
  const customers = await listCustomers(q, category);
  const res = jsonOk(customers);
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  return res;
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
