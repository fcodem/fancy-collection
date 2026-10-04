import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireUserReadOnly, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { getAllCategories } from "@/lib/categories";
import { addCustomCategory, getManagedCategoryGroups } from "@/lib/services/adminOps";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const wantGroups = req.nextUrl.searchParams.get("groups") === "1";
  const [categories, groups] = await Promise.all([
    getAllCategories(),
    wantGroups ? getManagedCategoryGroups() : Promise.resolve(undefined),
  ]);
  const res = jsonOk(groups ? { ...categories, groups } : categories);
  res.headers.set("Cache-Control", "private, no-cache");
  return res;
}

export async function POST(req: NextRequest) {
  const ct = requireJsonContentType(req);
  if (ct) return ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = (await req.json()) as { name?: string; group?: string };
    const name = String(body.name || "").trim();
    if (!name) return jsonError("Category name is required.");
    const group = String(body.group || "womens").trim() || "womens";
    const row = await addCustomCategory(name, group);
    return jsonOk({ ok: true, id: row.id, name: row.name, group: row.group });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to add category");
  }
}
