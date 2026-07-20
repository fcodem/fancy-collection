import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";
import { getAllCategories } from "@/lib/categories";

export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;
  const categories = await getAllCategories();
  const res = jsonOk(categories);
  res.headers.set("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
  return res;
}
