import { NextRequest } from "next/server";
import { listCustomCategories, addCustomCategory } from "@/lib/services/adminOps";
import { BASE_MENS, BASE_WOMENS, BASE_JEWELLERY, BASE_ACCESSORY } from "@/lib/constants";
import { jsonError, jsonOk, requireOwner, requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const custom_cats = await listCustomCategories();
  return jsonOk({
    custom_cats,
    base: { mens: BASE_MENS, womens: BASE_WOMENS, jewellery: BASE_JEWELLERY, accessory: BASE_ACCESSORY },
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const cat = await addCustomCategory(body.name, body.group || "other");
    return jsonOk({ ok: true, id: cat.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
