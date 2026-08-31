import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireFastReadUser, isResponse } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { lookupRecentCustomers, searchCustomers } from "@/lib/services/customerLookup";

export async function GET(req: NextRequest) {
  const user = await requireFastReadUser();
  if (isResponse(user)) return user;
  if (!isOwner(user)) return jsonError("Access denied. Owner permission required.", 403);

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const customers = q.length >= 2 ? await searchCustomers(q) : await lookupRecentCustomers();
  return jsonOk({ customers });
}
