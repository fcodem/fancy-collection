import { NextRequest } from "next/server";
import { jsonOk, requireFastReadUser, isResponse } from "@/lib/api";
import { lookupRecentCustomers, searchCustomers } from "@/lib/services/customerLookup";

export async function GET(req: NextRequest) {
  const user = await requireFastReadUser();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const customers = q.length >= 2 ? await searchCustomers(q) : await lookupRecentCustomers();
  const res = jsonOk({ customers });
  res.headers.set("Cache-Control", "private, max-age=20, stale-while-revalidate=40");
  return res;
}
