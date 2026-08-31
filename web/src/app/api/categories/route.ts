import { NextRequest } from "next/server";
import { jsonOk, jsonError, requireUserReadOnly, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";
import { getAllCategories } from "@/lib/categories";
import { addCustomCategory, getManagedCategoryGroups } from "@/lib/services/adminOps";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const [categories, groups] = await Promise.all([getAllCategories(), getManagedCategoryGroups()]);
  const res = jsonOk({ ...categories, groups });
  res.headers.set("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
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
